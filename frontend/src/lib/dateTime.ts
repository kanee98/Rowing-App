// The API stores UTC in MySQL DATETIME columns (which have no offset suffix).
export const utcDate = (value: string) => new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z');
export const dateText = (value?: string) => value ? utcDate(value).toLocaleString() : 'Not recorded';
export const localInput = (value: string) => {
  const date = utcDate(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const toUtcISOString = (localValue: string) => new Date(localValue).toISOString();
