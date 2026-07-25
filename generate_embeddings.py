#!/usr/bin/env python3
"""
批量生成 knowledge_base 表的 embedding
使用 OpenAI 兼容的 API（DeepSeek 或 OpenAI）
"""

import os
import json
import psycopg2
from psycopg2.extras import execute_values
import openai
from dotenv import load_dotenv

# 加载环境变量（优先 .env.local，与 Next.js 项目一致）
load_dotenv(".env.local")
load_dotenv()

# ============ 配置区 ============
# Supabase 连接信息
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")

# 数据库连接串（优先使用 DATABASE_URL）
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://postgres:{SUPABASE_KEY}@{SUPABASE_URL.replace('https://', '')}:5432/postgres",
)

# API 配置（使用 DeepSeek 或 OpenAI）
API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
API_BASE = os.getenv("OPENAI_API_BASE", "https://api.deepseek.com")

# Embedding 模型
EMBEDDING_MODEL = "text-embedding-3-small"  # OpenAI 专用
# 如果用 DeepSeek，可能不支持 embedding，需要换 OpenAI
# ===================================

# 初始化 OpenAI 客户端
client = openai.OpenAI(api_key=API_KEY, base_url=API_BASE)


def get_embedding(text):
    """调用 API 生成 embedding"""
    try:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text[:8192],  # 截断到模型限制
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"❌ Embedding 生成失败: {e}")
        return None


def main():
    print("🚀 开始生成 knowledge_base 表的 embedding...")

    # 1. 连接数据库
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        print("✅ 数据库连接成功")
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        print("   请检查 DATABASE_URL 环境变量")
        return

    # 2. 查询所有需要生成 embedding 的记录
    try:
        cur.execute(
            """
            SELECT id, content
            FROM knowledge_base
            WHERE embedding IS NULL
            AND content IS NOT NULL
            AND content != ''
            """
        )
        rows = cur.fetchall()
        print(f"📊 找到 {len(rows)} 条需要生成 embedding 的记录")
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        return

    if len(rows) == 0:
        print("✅ 所有记录已有 embedding，无需处理")
        cur.close()
        conn.close()
        return

    # 3. 批量生成 embedding
    print("🔄 开始生成 embedding（可能需要几分钟）...")
    updates = []
    failed_ids = []

    for i, (row_id, content) in enumerate(rows):
        print(f"  [{i + 1}/{len(rows)}] 处理 ID: {str(row_id)[:8]}...")

        embedding = get_embedding(content)
        if embedding:
            # 将 embedding 转为 pgvector 格式
            embedding_str = f"[{','.join(str(x) for x in embedding)}]"
            updates.append((embedding_str, row_id))
        else:
            failed_ids.append(row_id)

    # 4. 批量更新数据库
    if updates:
        print(f"\n📤 批量更新 {len(updates)} 条记录...")
        try:
            execute_values(
                cur,
                """
                UPDATE knowledge_base
                SET embedding = data.embedding::vector
                FROM (VALUES %s) AS data (embedding, id)
                WHERE knowledge_base.id = data.id::uuid
                """,
                updates,
                template="(%s, %s)",
                page_size=50,
            )
            conn.commit()
            print(f"✅ 成功更新 {len(updates)} 条记录")
        except Exception as e:
            print(f"❌ 数据库更新失败: {e}")
            print("   回退为逐条 UPDATE…")
            conn.rollback()
            ok = 0
            for embedding_str, row_id in updates:
                try:
                    cur.execute(
                        """
                        UPDATE knowledge_base
                        SET embedding = %s::vector
                        WHERE id = %s
                        """,
                        (embedding_str, row_id),
                    )
                    ok += 1
                except Exception as row_err:
                    print(f"   ❌ 更新失败 {row_id}: {row_err}")
                    failed_ids.append(row_id)
            conn.commit()
            print(f"✅ 逐条更新成功 {ok} 条")

    # 5. 报告失败记录
    if failed_ids:
        print(f"\n⚠️ {len(failed_ids)} 条记录生成失败:")
        for row_id in failed_ids[:5]:  # 只显示前5条
            print(f"  - {row_id}")
        if len(failed_ids) > 5:
            print(f"  ... 还有 {len(failed_ids) - 5} 条")

    # 6. 关闭连接
    cur.close()
    conn.close()

    print("\n" + "=" * 50)
    print("📝 处理完成!")
    print(f"✅ 成功: {len(updates)} 条")
    print(f"❌ 失败: {len(failed_ids)} 条")
    print("=" * 50)


if __name__ == "__main__":
    main()
