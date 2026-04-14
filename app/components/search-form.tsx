import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { Search } from "lucide-react";
import type { SuggestResult } from "~/lib/geocode.server";

const RADIUS_OPTIONS = [
  { value: "0.5", label: "½ mile" },
  { value: "1", label: "1 mile" },
  { value: "5", label: "5 miles" },
  { value: "10", label: "10 miles" },
  { value: "25", label: "25 miles" },
  { value: "50", label: "50 miles" },
  { value: "100", label: "100 miles" },
];

const SOURCE_OPTIONS = [
  { value: "1", label: "Any source" },
  { value: "2", label: "2+ sources" },
  { value: "3", label: "All 3 sources" },
];

interface SearchFormProps {
  query: string;
  radius: number;
  minSources: number;
}

const selectClass =
  "bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer";

export function SearchForm({ query, radius, minSources }: SearchFormProps) {
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading";

  const [inputValue, setInputValue] = useState(query);
  const [suggestions, setSuggestions] = useState<SuggestResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Only true when inputValue was changed by the user typing, not by programmatic updates
  const userTypingRef = useRef(false);

  // Keep input in sync if the query prop changes (e.g. back navigation)
  useEffect(() => {
    userTypingRef.current = false;
    setInputValue(query);
    setSelectedCoords(null);
  }, [query]);

  // Debounced fetch for suggestions — only runs when the user is actually typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!userTypingRef.current || inputValue.length < 2) {
      if (!userTypingRef.current) {
        setSuggestions([]);
        setOpen(false);
      }
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/geocode-suggest?q=${encodeURIComponent(inputValue)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as SuggestResult[];
        setSuggestions(data);
        setOpen(data.length > 0);
        setActiveIndex(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectSuggestion(result: SuggestResult) {
    userTypingRef.current = false;
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue(result.label);
    setSelectedCoords({ lat: result.lat, lng: result.lng });
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    // Submit on next tick so state is committed
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const listboxId = "location-suggestions";

  return (
    <Form ref={formRef} method="get" className="flex flex-col sm:flex-row gap-2 w-full">
      <div ref={containerRef} className="relative flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10"
        />
        <input
          name="q"
          value={inputValue}
          onChange={(e) => {
            userTypingRef.current = true;
            setInputValue(e.target.value);
            setSelectedCoords(null); // only clear coords on manual typing
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="City, state, or ZIP code"
          className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500 placeholder-zinc-500"
          aria-label="Location"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          role="combobox"
          autoComplete="off"
        />
        {selectedCoords && (
          <>
            <input type="hidden" name="lat" value={selectedCoords.lat} />
            <input type="hidden" name="lng" value={selectedCoords.lng} />
          </>
        )}
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden"
          >
            {suggestions.map((result, i) => (
              <li
                key={i}
                id={`suggestion-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent input blur before click registers
                  selectSuggestion(result);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`px-3 py-2 text-sm cursor-pointer truncate ${
                  i === activeIndex
                    ? "bg-blue-600 text-white"
                    : "text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {result.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <select
        name="r"
        defaultValue={String(radius)}
        className={`${selectClass} w-full sm:w-32`}
        aria-label="Search radius"
        onChange={() => inputValue.trim() && formRef.current?.requestSubmit()}
      >
        {RADIUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        name="min"
        defaultValue={String(minSources)}
        className={`${selectClass} w-full sm:w-36`}
        aria-label="Minimum sources"
        onChange={() => inputValue.trim() && formRef.current?.requestSubmit()}
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isSearching}
        className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {isSearching ? "Searching..." : "Search"}
      </button>
    </Form>
  );
}
