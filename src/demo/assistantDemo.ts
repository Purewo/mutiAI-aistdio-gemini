/**
 * FRONTEND-ONLY demo logic for the platform-assistant conversation.
 *
 * The real assistant is a product-owned conversation backed by a persistent Codex Thread through an
 * AssistantRuntimeAdapter (backend `docs/architecture/PLATFORM_ASSISTANT_CONVERSATION.md`). Its
 * `/api/v1/assistant` contracts are designed but not yet implemented, and that design explicitly
 * permits contract-shaped UI mocks for conversation states until the real API lands.
 *
 * This module is that mock: a deterministic drafting engine that turns a user message into an
 * `OrganizationSpec` draft plus templated reply text. It performs no reasoning and no requests, and
 * it must never be presented as backend output. The chat page labels the conversation as demo logic;
 * only the explicit confirm and publish actions call the real backend, through the contracted
 * proposal lifecycle in `src/api/endpoints.ts`.
 *
 * Everything here is replaced by the generated client when the assistant API enters OpenAPI.
 * Keep this file outside `src/api/`, `contracts/`, and `fixtures/`.
 */
import type { OrganizationSpec } from '../api/types';

/** Binding key used by the backend's local demo configuration; user-editable product data. */
const DEFAULT_BINDING_KEY = 'codex-local-default';

interface RoleSeed {
  role_key: string;
  name: string;
  responsibility: string;
  reports_to?: string;
}

interface Template {
  key: string;
  keywords: RegExp;
  name: string;
  description: string;
  leadName: string;
  leadResponsibility: string;
  specialists: RoleSeed[];
}

const TEMPLATES: Template[] = [
  {
    key: 'content',
    keywords: /内容|文章|写作|文案|营销|公众号|博客/,
    name: '内容研发组织',
    description: '由负责人统筹的内容生产组织，覆盖资料研究、内容撰写与成稿交付。',
    leadName: '内容负责人',
    leadResponsibility: '拆解选题需求、分配写作任务并审阅最终稿件。',
    specialists: [
      { role_key: 'researcher', name: '资料研究', responsibility: '收集并整理选题所需的事实材料与来源。' },
      { role_key: 'writer', name: '内容撰写', responsibility: '基于研究材料产出结构化初稿。' },
    ],
  },
  {
    key: 'data',
    keywords: /数据|分析|报表|统计|指标|可视化/,
    name: '数据分析组织',
    description: '面向业务数据的采集、分析与报告产出组织。',
    leadName: '分析负责人',
    leadResponsibility: '拆解分析需求、分配任务并审核最终报告。',
    specialists: [
      { role_key: 'collector', name: '数据采集', responsibility: '按需求收集并清洗原始数据。' },
      { role_key: 'analyst', name: '数据分析师', responsibility: '基于采集结果产出分析报告初稿。' },
    ],
  },
  {
    key: 'dev',
    keywords: /开发|研发|软件|产品|工程|代码|应用|网站|前端|后端/,
    name: '软件研发组织',
    description: '负责需求拆解、实现与验证的软件交付组织。',
    leadName: '研发负责人',
    leadResponsibility: '统筹研发计划、分配实现任务并验收交付质量。',
    specialists: [
      { role_key: 'frontend_dev', name: '前端开发', responsibility: '实现界面、交互与浏览器端逻辑。' },
      { role_key: 'backend_dev', name: '后端开发', responsibility: '实现服务、数据模型与接口。' },
    ],
  },
];

const FALLBACK_TEMPLATE: Template = {
  key: 'generic',
  keywords: /$^/,
  name: '通用交付组织',
  description: '由负责人统筹拆解、执行与交付的通用工作组织。',
  leadName: '组织负责人',
  leadResponsibility: '拆解需求、分配任务并审核最终交付。',
  specialists: [
    { role_key: 'executor', name: '执行专员', responsibility: '按分配的子任务完成具体工作。' },
    { role_key: 'assembler', name: '交付整合', responsibility: '整合各项产出为最终交付物。' },
  ],
};

const REVIEWER_KEYWORDS = /质量|校验|审核|测试|检查|复核/;

const REVIEWER_ROLE: RoleSeed = {
  role_key: 'reviewer',
  name: '质量校验',
  responsibility: '校验产出的准确性、完整性与一致性。',
};

export interface AssistantDraft {
  spec: OrganizationSpec;
  /** Templated reply the demo assistant shows alongside the structured draft. */
  replyText: string;
  templateKey: string;
}

function buildSpec(template: Template, extraSpecialists: RoleSeed[]): OrganizationSpec {
  const specialists = [...template.specialists, ...extraSpecialists];
  return {
    schema_version: '1.0',
    name: template.name,
    description: template.description,
    roles: [
      {
        role_key: 'lead',
        name: template.leadName,
        responsibility: template.leadResponsibility,
        is_lead: true,
        reports_to: null,
        runtime_binding_key: DEFAULT_BINDING_KEY,
      },
      ...specialists.map((seed) => ({
        role_key: seed.role_key,
        name: seed.name,
        responsibility: seed.responsibility,
        is_lead: false,
        reports_to: seed.reports_to ?? 'lead',
        runtime_binding_key: DEFAULT_BINDING_KEY,
      })),
    ],
  };
}

/**
 * Draft an organization proposal from one user message.
 *
 * `previous` is the draft the user is revising, when one is pending. The revision model mirrors the
 * product rule: revision means a new draft that supersedes the old one, never mutation in place.
 */
export function draftOrganization(message: string, previous: AssistantDraft | null): AssistantDraft {
  const template =
    TEMPLATES.find((candidate) => candidate.keywords.test(message)) ??
    (previous ? TEMPLATES.find((candidate) => candidate.key === previous.templateKey) : undefined) ??
    FALLBACK_TEMPLATE;

  const wantsReviewer =
    REVIEWER_KEYWORDS.test(message) ||
    (previous?.templateKey === template.key &&
      previous.spec.roles.some((role) => role.role_key === REVIEWER_ROLE.role_key));

  const spec = buildSpec(template, wantsReviewer ? [REVIEWER_ROLE] : []);

  const revising = previous !== null && previous.templateKey === template.key;
  const roleNames = spec.roles.map((role) => role.name).join('、');
  const replyText = revising
    ? `我基于您的反馈更新了「${spec.name}」方案，当前包含 ${spec.roles.length} 个岗位：${roleNames}。请确认方案，或继续告诉我需要调整的地方。`
    : `根据您的描述，我起草了「${spec.name}」方案，包含 ${spec.roles.length} 个岗位：${roleNames}。下方是结构预览。请确认方案，或继续告诉我需要调整的地方。`;

  return { spec, replyText, templateKey: template.key };
}

/** Opening message for an empty conversation. Static demo copy, not backend output. */
export const DEMO_GREETING =
  '您好！我是平台小助理。请描述您想创建的 AI 组织，例如它要解决的问题和需要哪些岗位，我会起草一份结构化方案供您确认。';

/** Suggested prompts for the empty conversation state. */
export const DEMO_SUGGESTIONS = [
  '我想要一个能写公众号文章的内容团队',
  '帮我建一个把业务数据变成分析报告的组织',
  '需要一个前后端配合的软件研发组织，注重质量校验',
];
