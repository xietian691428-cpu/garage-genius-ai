import jwt
import time

# 填写你的信息
TEAM_ID = "JUUADU6WTN"
CLIENT_ID = "com.garagegenius.web"
KEY_ID = "VZS99NP8JN"

# 读取你的 .p8 私钥文件内容
with open("AuthKey_VZS99NP8JN.p8", "r") as f:
    private_key = f.read()

# 生成 JWT
current_time = int(time.time())
expiry_time = current_time + (6 * 30 * 24 * 60 * 60)  # 约 6 个月后过期

headers = {
    "kid": KEY_ID,
    "alg": "ES256",
}

# Apple client_secret 必须用 aud=appleid.apple.com，并用 sub=Services ID。
# （不要写成 Supabase 的 /auth/v1 URL，否则 Apple 会拒签。）
payload = {
    "iss": TEAM_ID,
    "iat": current_time,
    "exp": expiry_time,
    "aud": "https://appleid.apple.com",
    "sub": CLIENT_ID,
}

token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
print(token)
