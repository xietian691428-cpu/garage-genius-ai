#!/usr/bin/env python3
"""
DeepSeek 微调脚本 (使用原生 API)
"""

import os
import time
import json
import requests

# ============ 配置区 ============
API_KEY = "sk-b57e09acecbe440089293c7cd3fc313b"  # ⚠️ 替换成你的真实密钥
BASE_URL = "https://api.deepseek.com"
TRAINING_FILE_PATH = "scripts/data/deepseek-finetune.jsonl"

# 微调参数
MODEL_NAME = "deepseek-chat"
EPOCHS = 4
# =================================

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def main():
    print("🚀 开始 DeepSeek 微调流程...")
    print(f"📁 训练数据: {TRAINING_FILE_PATH}")
    print(f"🤖 基础模型: {MODEL_NAME}")
    print(f"🔄 训练轮数: {EPOCHS}")
    print("-" * 50)

    # 1. 验证文件
    if not os.path.exists(TRAINING_FILE_PATH):
        print(f"❌ 文件不存在: {TRAINING_FILE_PATH}")
        return

    # 2. 上传文件 (使用原生文件上传端点)
    print("📤 上传训练文件...")
    try:
        with open(TRAINING_FILE_PATH, 'rb') as f:
            files = {'file': f}
            data = {'purpose': 'fine-tune'}
            # DeepSeek 文件上传端点通常是 /v1/files
            response = requests.post(
                f"{BASE_URL}/v1/files",
                headers={"Authorization": f"Bearer {API_KEY}"},
                files=files,
                data=data
            )
            response.raise_for_status()
            file_id = response.json().get('id')
            print(f"✅ 文件上传成功! File ID: {file_id}")
    except Exception as e:
        print(f"❌ 文件上传失败: {e}")
        print(f"   响应内容: {e.response.text if hasattr(e, 'response') else 'N/A'}")
        return

    # 3. 创建微调任务 (使用原生微调端点)
    print("🔄 创建微调任务...")
    try:
        payload = {
            "training_file": file_id,
            "model": MODEL_NAME,
            "hyperparameters": {"n_epochs": EPOCHS}
        }
        # DeepSeek 微调创建端点通常是 /v1/fine_tuning/jobs
        response = requests.post(
            f"{BASE_URL}/v1/fine_tuning/jobs",
            headers=HEADERS,
            json=payload
        )
        response.raise_for_status()
        job_data = response.json()
        job_id = job_data.get('id')
        print(f"✅ 微调任务创建成功! Task ID: {job_id}")
        print(f"📊 任务状态: {job_data.get('status')}")
    except Exception as e:
        print(f"❌ 创建微调任务失败: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"   响应内容: {e.response.text}")
        return

    # 4. 监控任务进度
    print("\n⏳ 开始监控任务进度 (按 Ctrl+C 停止)...")
    try:
        while True:
            response = requests.get(
                f"{BASE_URL}/v1/fine_tuning/jobs/{job_id}",
                headers=HEADERS
            )
            response.raise_for_status()
            status_data = response.json()
            status = status_data.get('status')

            if status == "succeeded":
                print(f"✅ 微调成功! 模型: {status_data.get('fine_tuned_model')}")
                break
            elif status == "failed":
                print(f"❌ 微调失败: {status_data.get('error')}")
                break
            elif status in ["queued", "running"]:
                print(f"⏳ 任务状态: {status}... 等待30秒...")
            else:
                print(f"📊 当前状态: {status}")

            time.sleep(30)
    except KeyboardInterrupt:
        print("\n⏹️ 监控已中断。")
        print(f"📋 稍后可使用 Task ID '{job_id}' 查询进度。")

    print("\n" + "=" * 50)
    print("📝 微调任务流程结束")
    print(f"📋 Task ID: {job_id}")
    print("=" * 50)

if __name__ == "__main__":
    main()