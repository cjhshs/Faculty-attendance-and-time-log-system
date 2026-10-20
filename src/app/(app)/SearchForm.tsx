export function SearchForm({
  action,
  name,
  defaultValue = "",
  placeholder,
  hidden = {},
  className = "",
}: {
  action: string;
  name: string;
  defaultValue?: string;
  placeholder: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  const hasValue = defaultValue.length > 0;
  const clearParams = new URLSearchParams();
  for (const [key, value] of Object.entries(hidden)) {
    if (value) clearParams.set(key, value);
  }
  const clearHref = clearParams.toString() ? `${action}?${clearParams.toString()}` : action;

  return (
    <form method="get" action={action} className={"flex items-center gap-2 " + className} role="search">
      {Object.entries(hidden).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="input w-full pl-8"
          aria-label={placeholder}
        />
      </div>
      <button type="submit" className="btn">
        Search
      </button>
      {hasValue ? (
        <a href={clearHref} className="btn" title="Clear search">
          Clear
        </a>
      ) : null}
    </form>
  );
}
