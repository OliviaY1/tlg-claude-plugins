# Gmail search (search_threads)

Every mode searches Gmail this way. The claude.ai Gmail connector has two limits (checked 2026-10-31):

- `after:` / `before:` with epoch seconds return nothing, even when mail exists. Use only `newer_than:` and `older_than:` with `h` or `d` (e.g. `newer_than:16h older_than:8h`).
- One page holds at most 50 threads (`pageSize` max 50), and `nextPageToken` is not returned even when more exist. `resultSizeEstimate` is only an estimate. Paging does not work; never rely on it.

## Search a window

Window = the last `H` hours (`N` days = `24N` hours).

1. Search `newer_than:<H>h` plus the query terms, `pageSize` 50.
2. Fewer than 50 threads: complete. Exactly 50 (or a `nextPageToken`): it may be cut. Split the slice in two (`newer_than:<H>h older_than:<H/2>h` and `newer_than:<H/2>h`) and search each. Repeat on any slice that returns 50.
3. Smallest slice is 1 hour. If a 1-hour slice still returns 50, say in the report that the search may be incomplete.
4. Merge all slices and dedupe by thread id. Slice edges are whole hours and overlap; dedupe handles it. Never shrink the window below what was asked.

Hours since a time `t` (epoch seconds), rounded up plus 1 for safety:
`python3 -c "import math,time; print(math.ceil((time.time()-t)/3600)+1)"`

## MAWB searches

The no-date-limit MAWB search (Step 2) uses the same rule: if it returns 50 threads, split it with `older_than:` / `newer_than:` (e.g. `newer_than:30d` and `older_than:30d`) until each part is under 50.

## Messages in a thread

Search previews show only about 5 messages per thread. When `messageCount` is larger, `get_thread` (`METADATA_ONLY`) to see the rest.
