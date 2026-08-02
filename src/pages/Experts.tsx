import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  AlertCircle,
  Code2,
  FileSearch,
  Filter,
  History,
  Image as ImageIcon,
  Layers3,
  MessageSquareText,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createExpertConversation,
  listExpertCategories,
  listExpertConversations,
  listExperts,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { ExpertCatalogItem, ExpertCategory, ExpertInteractionMode } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import { describeExpertUnavailability } from '../expert/eligibility';
import { formatDateTime } from '../lib/format';

type InteractionFilter = 'all' | ExpertInteractionMode;
type EligibilityFilter = 'all' | 'eligible';

export default function Experts() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [provider, setProvider] = useState('all');
  const [interaction, setInteraction] = useState<InteractionFilter>('all');
  const [eligibility, setEligibility] = useState<EligibilityFilter>('all');
  const [startingVersionId, setStartingVersionId] = useState<string | null>(null);
  const [startError, setStartError] = useState<ApiError | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const directory = useApiResource((signal) => listExperts({ limit: 100 }, signal), []);
  const categories = useApiResource((signal) => listExpertCategories(signal), []);
  const catalog = useApiResource(
    (signal) =>
      listExperts(
        {
          query: debouncedQuery || undefined,
          provider: provider === 'all' ? undefined : provider,
          category: selectedCategory ? [selectedCategory] : undefined,
          interaction_mode: interaction === 'all' ? undefined : interaction,
          eligible_only: eligibility === 'eligible' ? true : undefined,
          limit: 100,
        },
        signal,
      ),
    [debouncedQuery, eligibility, interaction, provider, selectedCategory],
  );
  const conversations = useApiResource((signal) => listExpertConversations(signal), []);

  const directoryItems = useMemo(() => {
    if (directory.state.status === 'ready') return directory.state.data;
    if (catalog.state.status === 'ready') return catalog.state.data;
    return [];
  }, [catalog.state, directory.state]);

  const providers = useMemo(() => {
    return [...new Set(directoryItems.map((item) => item.provider))].sort();
  }, [directoryItems]);

  const categoryNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    if (categories.state.status === 'ready') {
      for (const category of categories.state.data) {
        map.set(category.category_key, category.display_name);
      }
    }
    return map;
  }, [categories.state]);

  const catalogByVersion = useMemo(() => {
    const map = new Map<string, ExpertCatalogItem>();
    for (const item of directoryItems) map.set(item.expert_version_id, item);
    return map;
  }, [directoryItems]);

  const hasActiveFilters = Boolean(
    query.trim() ||
      selectedCategory ||
      provider !== 'all' ||
      interaction !== 'all' ||
      eligibility !== 'all',
  );

  const startTrial = async (item: ExpertCatalogItem) => {
    if (!item.eligible || startingVersionId) return;
    setStartingVersionId(item.expert_version_id);
    setStartError(null);
    try {
      const conversation = await createExpertConversation({ expert_version_id: item.expert_version_id });
      navigate(`/experts/conversations/${encodeURIComponent(conversation.conversation_id)}`);
    } catch (cause: unknown) {
      setStartError(apiErrorFromThrown(cause));
    } finally {
      setStartingVersionId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nexwork-page)]">
      <PageHeader title="专家市场" />
      <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <section className="expert-marketplace-hero relative overflow-hidden rounded-[1.75rem] px-5 py-6 sm:px-8 sm:py-8">
            <div
              className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-amber-300/15 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="max-w-2xl">
                <p className="expert-marketplace-hero-badge inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.14em]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  新手指南
                </p>
                <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                  先试用，再把合适的专家加入组织
                </h2>
              </div>
              <ol className="grid grid-cols-3 gap-2 lg:min-w-[23rem]" aria-label="专家使用步骤">
                {['选择能力', '开始试用', '添加到组织'].map((step, index) => (
                  <li
                    key={step}
                    className="rounded-2xl border border-blue-200/60 bg-white/70 px-2.5 py-3 text-center backdrop-blur"
                  >
                    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-black text-white">
                      {index + 1}
                    </span>
                    <span className="mt-2 block text-xs font-bold text-slate-700">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section
            aria-labelledby="expert-category-heading"
            className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <h2 id="expert-category-heading" className="text-base font-black tracking-tight text-slate-900 sm:text-lg">
                选择能力类型
              </h2>
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 sm:self-auto"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  返回全部
                </button>
              ) : null}
            </div>

            {categories.state.status === 'loading' ? (
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5" aria-label="正在读取专家分类">
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : null}
            {categories.state.status === 'error' ? (
              <div className="p-4 sm:p-5">
                <ErrorState
                  error={categories.state.error}
                  title="专家分类加载失败"
                  onRetry={categories.reload}
                />
              </div>
            ) : null}
            {categories.state.status === 'ready' ? (
              <div
                className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5"
                role="radiogroup"
                aria-label="专家能力分类"
              >
                <CategoryButton
                  name="全部专家"
                  description="不限能力类型"
                  count={directory.state.status === 'ready' ? directoryItems.length : null}
                  selected={selectedCategory === null}
                  icon={Layers3}
                  onClick={() => setSelectedCategory(null)}
                />
                {categories.state.data.map((category) => (
                  <CategoryButton
                    key={category.category_key}
                    name={category.display_name}
                    description={category.description ?? '更多专业能力'}
                    count={category.expert_count}
                    selected={selectedCategory === category.category_key}
                    icon={categoryIcon(category.category_key)}
                    onClick={() => setSelectedCategory(category.category_key)}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <span className="sr-only">搜索专家</span>
                <input
                  id="expert-search"
                  name="expert-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={100}
                  className="form-control pl-10 pr-10"
                  placeholder="搜索专家或能力"
                />
                {query.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="清空专家搜索"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FilterSelect name="provider" label="服务来源" value={provider} onChange={setProvider}>
                  <option value="all">全部来源</option>
                  {providers.map((item) => (
                    <option key={item} value={item}>{providerLabel(item)}</option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  name="interaction-mode"
                  label="使用方式"
                  value={interaction}
                  onChange={(value) => setInteraction(value as InteractionFilter)}
                >
                  <option value="all">全部方式</option>
                  <option value="conversational">连续会话</option>
                  <option value="request_response">单次请求</option>
                </FilterSelect>
                <FilterSelect
                  name="eligibility"
                  label="可用状态"
                  value={eligibility}
                  onChange={(value) => setEligibility(value as EligibilityFilter)}
                >
                  <option value="all">全部状态</option>
                  <option value="eligible">仅可试用</option>
                </FilterSelect>
              </div>
            </div>
          </section>

          {startError ? <InlineError error={startError} /> : null}

          {catalog.state.status === 'loading' ? <LoadingState label="正在加载专家…" /> : null}
          {catalog.state.status === 'error' ? (
            <ErrorState error={catalog.state.error} title="专家加载失败" onRetry={catalog.reload} />
          ) : null}
          {catalog.state.status === 'ready' && catalog.state.data.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? '没有找到符合条件的专家' : '暂无可用专家'}
              description={hasActiveFilters ? '试试调整搜索词或筛选条件。' : '新的专家上线后会显示在这里。'}
            />
          ) : null}
          {catalog.state.status === 'ready' && catalog.state.data.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold text-slate-500">
                  共 <span className="font-black text-slate-900">{catalog.state.data.length}</span> 位专家
                  {selectedCategory
                    ? ` · ${categoryNameByKey.get(selectedCategory) ?? selectedCategory}`
                    : ''}
                </p>
                {debouncedQuery ? (
                  <p className="max-w-full truncate text-xs text-slate-400">搜索：{debouncedQuery}</p>
                ) : null}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {catalog.state.data.map((item) => (
                  <ExpertCard
                    key={item.expert_version_id}
                    item={item}
                    categoryLabel={item.category ? categoryNameByKey.get(item.category) ?? item.category : '未分类'}
                    busy={startingVersionId === item.expert_version_id}
                    onStart={() => void startTrial(item)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {conversations.state.status === 'ready' && conversations.state.data.length > 0 ? (
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <History className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                    最近试用
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {conversations.state.data.slice(0, 6).map((conversation) => {
                  const expert = catalogByVersion.get(conversation.expert_version_id);
                  return (
                    <Link
                      key={conversation.conversation_id}
                      to={`/experts/conversations/${encodeURIComponent(conversation.conversation_id)}`}
                      className="group flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 transition hover:border-cyan-200 hover:bg-cyan-50/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">
                          {expert?.display_name ?? '专家试用'}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {conversation.status === 'archived' ? '已归档' : '进行中'} · {formatDateTime(conversation.updated_at)}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-cyan-700" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExpertCard({
  item,
  categoryLabel,
  busy,
  onStart,
}: {
  item: ExpertCatalogItem;
  categoryLabel: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg hover:shadow-cyan-950/5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-amber-400 opacity-70" aria-hidden="true" />
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15">
          <Bot className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black tracking-tight text-slate-900">{item.display_name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              v{item.version_number}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">
            {providerLabel(item.provider)} · {categoryLabel}
          </p>
        </div>
        <EligibilityDot item={item} />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{item.short_description}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-800">
          {item.interaction_mode === 'conversational' ? '连续会话' : '单次请求'}
        </span>
        <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-amber-800">
          {item.capability.text_input_mode === 'required'
            ? '需要文字'
            : item.capability.text_input_mode === 'optional'
              ? '文字可选'
              : '仅附件'}
        </span>
        {item.tags
          .filter((tag) => tag.toLowerCase() !== item.provider.toLowerCase())
          .slice(0, 3)
          .map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">#{tag}</span>
          ))}
      </div>

      {!item.eligible ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{describeExpertUnavailability(item.eligibility_reason_codes)}</span>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Link
          to={`/experts/${encodeURIComponent(item.expert_id)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
        >
          查看详情
        </Link>
        {item.eligible ? (
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Sparkles className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {busy ? '正在创建…' : '开始试用'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CategoryButton({
  name,
  description,
  count,
  selected,
  icon: Icon,
  onClick,
}: {
  name: string;
  description: string;
  count: number | null;
  selected: boolean;
  icon: typeof Layers3;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      className={`group relative min-h-28 overflow-hidden rounded-2xl border p-3.5 text-left transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 ${
        selected
          ? 'border-blue-500 bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-900/15'
          : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/60'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          selected ? 'bg-white/20 text-white' : 'bg-white text-cyan-800 shadow-sm'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-black">{name}</span>
        <span className={`text-xs font-black ${selected ? 'text-cyan-100' : 'text-slate-400'}`}>
          {count ?? '—'}
        </span>
      </span>
      <span className={`mt-1 block line-clamp-2 text-[11px] leading-4 ${selected ? 'text-blue-50' : 'text-slate-500'}`}>
        {description}
      </span>
    </button>
  );
}

function categoryIcon(categoryKey: ExpertCategory['category_key']): typeof Layers3 {
  if (categoryKey === 'data-analysis') return BarChart3;
  if (categoryKey === 'document-extraction') return FileSearch;
  if (categoryKey === 'image-generation') return ImageIcon;
  if (categoryKey === 'software-development') return Code2;
  return Layers3;
}

function EligibilityDot({ item }: { item: ExpertCatalogItem }) {
  const tone = item.eligible
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : item.eligibility_status === 'blocked'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tone}`}>
      {item.eligible ? '可试用' : '暂不可用'}
    </span>
  );
}

function FilterSelect({
  name,
  label,
  value,
  onChange,
  children,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const controlId = `expert-filter-${name}`;
  return (
    <label htmlFor={controlId} className="relative block">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select
        id={controlId}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-control min-w-0 pl-9 pr-8"
      >
        {children}
      </select>
    </label>
  );
}

function providerLabel(provider: string): string {
  return provider === 'codex' ? 'Codex' : provider === 'dify' ? 'Dify' : provider;
}
