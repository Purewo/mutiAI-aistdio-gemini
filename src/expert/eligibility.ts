/** Product-facing copy for backend-owned Expert eligibility states. */
export function describeExpertUnavailability(reasonCodes: string[]): string {
  if (reasonCodes.includes('runtime_provider_not_configured')) {
    return '服务暂未配置完成，当前无法试用。';
  }
  return '当前暂不可试用，请稍后再试。';
}
