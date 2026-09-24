#!/usr/bin/env python
"""example/lie 前端交互的数值核验（先算后写，红线 4）。

核验对象：index.html 里的两个 Canvas 交互将实现的所有数学断言。
跑法：cd /Users/apple/develop/learning && uv run python learning-web/example/lie/review/verify_math.py
"""
import numpy as np

TOL = 1e-12
failures = []


def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} {detail}")
    if not ok:
        failures.append(name)


def skew(w):
    return np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])


def rodrigues(n, theta):
    """R = I + sin θ [n]× + (1−cos θ) [n]×²"""
    K = skew(n)
    return np.eye(3) + np.sin(theta) * K + (1 - np.cos(theta)) * (K @ K)


def quat_from_axis_angle(n, theta):
    """q = (cos(θ/2), sin(θ/2) n)"""
    return np.concatenate([[np.cos(theta / 2)], np.sin(theta / 2) * np.asarray(n)])


def quat_rotate(q, v):
    """v' = q v q*（v 视为纯虚四元数 (0, v)）"""
    w, x, y, z = q
    qv = np.array([0.0, v[0], v[1], v[2]])
    # 四元数乘法 q * p
    def mul(a, b):
        aw, ax, ay, az = a
        bw, bx, by, bz = b
        return np.array([
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ])
    # 共轭
    qc = np.array([w, -x, -y, -z])
    return mul(mul(q, qv), qc)[1:]


rng = np.random.default_rng(42)

# ---------- 1. Rodrigues：正交性 + 行列式 ----------
for n in [np.array([0, 0, 1.0]), np.array([1, 0, 0.0])]:
    for theta in [0.3, 1.0, np.pi, 2 * np.pi, 4 * np.pi]:
        R = rodrigues(n, theta)
        err_orth = np.linalg.norm(R.T @ R - np.eye(3))
        det = np.linalg.det(R)
        check(f"rodrigues n={n} θ={theta:.2f} 正交", err_orth < 1e-12, f"‖RᵀR−I‖={err_orth:.2e}")
        check(f"rodrigues n={n} θ={theta:.2f} 行列式", abs(det - 1) < 1e-12, f"det={det:.12f}")

# 随机轴（归一化）
for _ in range(5):
    n = rng.normal(size=3)
    n /= np.linalg.norm(n)
    theta = rng.uniform(0, 4 * np.pi)
    R = rodrigues(n, theta)
    check("rodrigues 随机轴 正交", np.linalg.norm(R.T @ R - np.eye(3)) < 1e-12)
    check("rodrigues 随机轴 det", abs(np.linalg.det(R) - 1) < 1e-12)

# ---------- 2. 四元数作用 = Rodrigues 矩阵作用 ----------
for _ in range(8):
    n = rng.normal(size=3)
    n /= np.linalg.norm(n)
    theta = rng.uniform(0, 2 * np.pi)
    v = rng.normal(size=3)
    R = rodrigues(n, theta)
    q = quat_from_axis_angle(n, theta)
    v1 = R @ v
    v2 = quat_rotate(q, v)
    err = np.linalg.norm(v1 - v2)
    check(f"quat == rodrigues θ={theta:.2f}", err < 1e-12, f"err={err:.2e}")

# ---------- 3. 二重覆盖：q 与 −q 给出同一旋转 ----------
for _ in range(8):
    n = rng.normal(size=3)
    n /= np.linalg.norm(n)
    theta = rng.uniform(0, 2 * np.pi)
    v = rng.normal(size=3)
    q = quat_from_axis_angle(n, theta)
    err = np.linalg.norm(quat_rotate(q, v) - quat_rotate(-q, v))
    check("q 与 −q 同一旋转", err < 1e-12, f"err={err:.2e}")

# ---------- 4. 2π/4π：SO(3) 回家、SU(2) 不回家 / 回家 ----------
n = np.array([0.0, 0.0, 1.0])
R2pi = rodrigues(n, 2 * np.pi)
q2pi = quat_from_axis_angle(n, 2 * np.pi)
q4pi = quat_from_axis_angle(n, 4 * np.pi)
check("SO(3): θ=2π 时 R=I", np.linalg.norm(R2pi - np.eye(3)) < 1e-12)
check("SU(2): θ=2π 时 q 的 w 分量 = −1（未回家）", abs(q2pi[0] + 1) < 1e-12, f"q={q2pi}")
check("SU(2): θ=4π 时 q=+1", np.allclose(q4pi, [1, 0, 0, 0], atol=1e-12), f"q={q4pi}")

# ---------- 5. Slerp：端点 + 单位长度 + 常角速度 ----------
def slerp(q0, q1, t):
    dq = np.dot(q0, q1)
    if dq < 0:  # 取短弧
        q1 = -q1
        dq = -dq
    Omega = np.arccos(np.clip(dq, -1, 1))
    if Omega < 1e-9:
        return q0
    s = np.sin((1 - t) * Omega) / np.sin(Omega)
    s2 = np.sin(t * Omega) / np.sin(Omega)
    q = s * q0 + s2 * q1
    return q / np.linalg.norm(q)


q0 = quat_from_axis_angle([0, 0, 1.0], 0.0)
q1 = quat_from_axis_angle([0, 1, 0.0], np.pi / 2)  # 任意两不同旋转
check("slerp t=0 → q0", np.linalg.norm(slerp(q0, q1, 0) - q0) < 1e-12)
check("slerp t=1 → q1", np.linalg.norm(slerp(q0, q1, 1) - q1) < 1e-12)
all_unit = all(abs(np.linalg.norm(slerp(q0, q1, t)) - 1) < 1e-12 for t in np.linspace(0, 1, 21))
check("slerp 全程单位长度", all_unit)
# 常角速度：相邻步的内积间隔一致
dots = [np.dot(slerp(q0, q1, t), slerp(q0, q1, t + 0.05)) for t in np.linspace(0, 0.9, 19)]
spread = max(dots) - min(dots)
check("slerp 常角速度", spread < 1e-9, f"内积间隔极差={spread:.2e}")

# ---------- 6. 前端将硬编码的 3B1B 覆盖演示断言 ----------
# SO(3) 立方体与 SU(2) 轨迹：θ∈[0,4π]，展示 SO(3) 视角 2π 复位、SU(2) 视角 4π 复位
thetas = np.linspace(0, 4 * np.pi, 200)
so3_back_at_2pi = np.linalg.norm(rodrigues(n, 2 * np.pi) - np.eye(3)) < TOL
qs = [quat_from_axis_angle(n, t) for t in thetas]
su2_first_back = thetas[np.argmax([np.allclose(q, [1, 0, 0, 0], atol=1e-9) and t > 0 for t, q in zip(thetas, qs)])]
check("覆盖演示: SO(3) 在 2π 复位", so3_back_at_2pi)
check("覆盖演示: SU(2) 首次复位在 4π", abs(su2_first_back - 4 * np.pi) < 1e-9, f"t={su2_first_back:.4f} rad")

print()
if failures:
    print(f"共 {len(failures)} 项 FAIL：{failures}")
    raise SystemExit(1)
print("全部通过。")
