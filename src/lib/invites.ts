export function inviteCode(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed)
    return new URLSearchParams(url.hash.slice(1)).get('invite') ?? url.searchParams.get('invite') ?? ''
  }
  return trimmed
}
export function currentInvite(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('invite') ??
    new URLSearchParams(window.location.search).get('invite') ?? ''
}
export function inviteLink(code: string): string {
  return window.location.origin + window.location.pathname + '#invite=' + encodeURIComponent(code)
}
