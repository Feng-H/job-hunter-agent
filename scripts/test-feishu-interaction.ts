import { FeishuNotifier } from "../src/modules/feishu/FeishuClient.js";
import { CollectorServer } from "../src/modules/server/CollectorServer.js";
import { JobHunterCore } from "../src/core.js";

async function main() {
  const core = new JobHunterCore();
  const testPort = 8992;
  const server = new CollectorServer(core, testPort);
  await server.start();

  try {
    // 注册真实岗位到 tracker
    const realJob = {
      id: "feishu_real_job_001",
      title: "资深架构师",
      company: "极速创新",
      city: "深圳",
      workMode: "HYBRID" as const,
      salaryText: "40-60K",
      description: "微服务与云原生架构",
      url: "https://example.com/job/real001",
      platform: "LIEPIN" as const,
      publishOrActiveTime: "2小时前在线",
      discoveredAt: new Date().toISOString()
    };
    (core as any).tracker.registerDiscoveredJob(realJob);
    (core as any).tracker.updateStatus(realJob.id, "PENDING_REVIEW");

    // 1. 验证通过 GET /api/feishu/action?action=APPROVE 审批真实岗位
    const approveRes = await fetch(`http://127.0.0.1:${testPort}/api/feishu/action?action=APPROVE&jobId=${realJob.id}`);
    const approveHtml = await approveRes.text();
    if (!approveHtml.includes("投递意向已确认") || !approveHtml.includes("极速创新")) {
      throw new Error("Real job action approve HTML mismatch: " + approveHtml.slice(0, 300));
    }

    const recAfterApprove = (core as any).tracker.getRecord(realJob.id);
    if (recAfterApprove.status !== "APPLIED") {
      throw new Error(`Expected APPLIED, got ${recAfterApprove.status}`);
    }
    console.log("✅ 真实岗位通过 Action URL 审批成功！状态已流转为:", recAfterApprove.status);

    // 2. 验证通过 POST /api/feishu/webhook 拒绝真实岗位
    const realJob2 = {
      id: "feishu_real_job_002",
      title: "后端专家",
      company: "未来制造",
      city: "广州",
      workMode: "ONSITE" as const,
      salaryText: "30-45K",
      description: "Go/Java",
      url: "https://example.com/job/real002",
      platform: "BOSS" as const,
      publishOrActiveTime: "刚刚",
      discoveredAt: new Date().toISOString()
    };
    (core as any).tracker.registerDiscoveredJob(realJob2);

    const webhookRejectRes = await fetch(`http://127.0.0.1:${testPort}/api/feishu/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: {
          value: { action: "REJECT", jobId: realJob2.id }
        }
      })
    });
    const webhookRejectData = await webhookRejectRes.json() as any;
    console.log("Webhook reject toast:", webhookRejectData.toast);

    const recAfterReject = (core as any).tracker.getRecord(realJob2.id);
    if (recAfterReject.status !== "REJECTED_BY_USER") {
      throw new Error(`Expected REJECTED_BY_USER, got ${recAfterReject.status}`);
    }
    console.log("✅ 真实岗位通过 Webhook 卡片拒绝成功！状态已流转为:", recAfterReject.status);

  } finally {
    process.exit(0);
  }
}

main().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
