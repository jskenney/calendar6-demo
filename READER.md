# Using epub-reader as the page reader for calendar6-demo

A review of [jskenney/epub-reader](https://github.com/jskenney/epub-reader) ("Spine Reader",
at commit `f7277f8`) against what calendar6's `html.php` and `get.php` give a front end, and
the changes that would let it read course pages (Markdown first, HTML later) while it keeps
doing its standalone job unchanged. Nothing in epub-reader was changed for this review.

Contents: [1. Summary](#1-summary) · [2. What the reader does today](#2-what-the-reader-does-today) ·
[3. What calendar6 hands it](#3-what-calendar6-hands-it) · [4. Where they do not meet](#4-where-they-do-not-meet) ·
[5. Suggested changes to epub-reader](#5-suggested-changes-to-epub-reader) ·
[6. A configuration for this site](#6-a-configuration-for-this-site) ·
[7. What calendar6-demo would change](#7-what-calendar6-demo-would-change) ·
[8. Order of work](#8-order-of-work) · [9. Open questions](#9-open-questions)

---

## 1. Summary

The reader can not open a course page today, and the reason is small: it identifies a
document by its **file name and folder**, and a course page is an **endpoint address with a
key** (`calendar/php/html.php?file=KEY`). It drops the query string, sees `.php`, and looks
for an EPUB folder. Tried against this site:

```
?book=../calendar/php/html.php?file=8IKY…   →  "Nothing was found at /calendar/php/html.php/
                                                (no META-INF/container.xml)"
```

`?get=` with the full address fails the same way.

Most of the reader already suits the job, and its security model is stricter than this
site's own page view, which is a reason to use it. The work is in five places:

1. **Opening by address-with-query**, with the kind taken from the server's answer.
2. **Addresses inside the page**: `get.php?file=KEY` pictures and files, and `#/view/KEY`
   links to other pages, neither of which is a path in a folder.
3. **Identity**: the saved position, the title and the editor all assume a file name.
4. **Being a part of another site**: no fallback to a sample book, no Open or Edit, a way
   back, and optionally living in a frame.
5. **Course-page features** the reader has no equivalent for: math, code highlighting,
   unlock forms, and pages that depend on their own scripts (needed for HTML, hardly for
   Markdown).

All of it can be driven from `reader-config.json`, so a reader with no such configuration
behaves exactly as it does now. Section 5 lists the changes as R-1 to R-16.

---

## 2. What the reader does today

Read from `index.html` (one file, about 8,400 lines) and the README.

**Opening.** `?book=`, `?edit=` and `?get=` (`index.html` near line 8207). For `?book=`:

- `bookCandidates()` builds the addresses to try, the path relative to the page and then
  under `/bookshelf/`, and **clears the query string and fragment** of each.
- `docKind(u.pathname)` decides the kind **from the extension**: `.md`/`.markdown` →
  Markdown (converted with marked), `.html`/`.htm`/`.xhtml` → HTML, `.txt` → text; `.epub`
  and `.cbz` are archives; anything else is taken to be an extracted EPUB folder.
  `docKind(name, type)` already accepts a content type, but no caller passes one.
- `fetchDocument()` fetches with the browser's default credentials (cookies go along on the
  same site), refuses a redirect to another site, and runs a "soft not-found" check: it
  fetches a made-up name in the same folder and compares the two answers.
- On any failure it opens the folder's default book (or the built-in sample) with a notice.

**Building the document.** `buildDocument()` parses HTML with `DOMParser`, takes the title
from `<title>`, else the first `h1`/`h2`, else the file name; keeps the head's `<style>` and
style sheet links; gives headings ids; builds the contents list; splits only past 200,000
characters. `#id` links are pointed at the part that holds the id.

**Cleaning and showing.** Each part is shown in
`<iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox">` through
`srcdoc`, with no `allow-scripts` and no `allow-forms`, and a Content-Security-Policy on the
page itself (`bookPolicy()`): `default-src 'none'`, pictures, media and fonts only from
`data:`, `blob:` and **the document's folder**, `form-action 'none'`.

- `sanitize()` removes `script`, `object`, `embed`, `iframe`, `base`, `meta http-equiv`,
  `template` and every `on…` attribute.
- `localize()` resolves every picture, media and style address **as a path inside the
  book** (`resolve()` keeps only the path; `dirSource()` then encodes each segment and
  refuses anything outside the document's folder). An address it can not resolve is removed.
- `markLinks()` sends `http(s)`, `mailto` and `tel` links to a new tab; every other link
  becomes an in-book link (`data-spine-path`), and `goTo()` answers one that is not in the
  book with "That link points to …, which isn't part of the book's reading order."
- `onFrameClick()` cancels every other click on a link, so nothing can navigate the frame.

**Identity and state.** The reading position is stored under
`spine:pos:url:<pathname>`; editor drafts under the same key. Finished natural-voice audio
is kept in IndexedDB. Settings per folder come from `reader-config.json`
(`CONFIG_SETTINGS`), with `LOCKED` for what readers may not change.

**Not there:** math typesetting, code highlighting, any `postMessage` or embedding
interface, any notion of a signed-in viewer. A server API with sign-in is planned as E-22 in
`TODO.md`, for saving files and reading progress, not for fetching protected pages.

---

## 3. What calendar6 hands it

From calendar6's `API.md` (§8–§10), as this site uses it:

| | |
|---|---|
| A page | `GET calendar/php/html.php?file=KEY[&name=value]` → `text/html`, already processed for the viewer. **A Markdown file comes back as HTML**; the source is never sent. A fragment or a whole document, as the file is. `Cache-Control: private, no-store`. |
| Not allowed or missing | `404` with a JSON body `{"error": "…"}`. The same answer for both, on purpose. |
| Pictures, files, style sheets in the page | absolute paths with a key: `/…/calendar/php/get.php?file=KEY` |
| Links to other pages | `href="#/view/KEY"`, optionally `#/view/KEY?name=value` and a fragment |
| Links the viewer may not follow | the element without its target, `data-cal6-hidden="1"` |
| Inserted markup | `details.cal6-student` ("Show answer"), `form.cal6-lock` (a POST of `lock` and `csrf` that answers `303` to the page), `pre.cal6-ace`, `p.cal6-error` |
| Left as written | `<script>`, `<style>`, math (`\( \)`, `\[ \]`, `$$ $$`) and code blocks, for the front end to run, typeset and highlight |
| Who is asking | the session cookie (`SameSite=Strict`, limited to the course's path); every fetch is checked again |
| Titles | not in the page: the event's or page's title is in `calendar.php` |

A key is 22 characters of `[A-Za-z0-9_-]`, stable until the course's secret or the event
changes.

---

## 4. Where they do not meet

| # | Today | Effect on a course page | Change |
|---|---|---|---|
| 1 | The query string is dropped from `?book=` | `html.php?file=KEY` becomes `html.php`: nothing opens | R-1 |
| 2 | The kind comes from the extension | `.php` is taken for an EPUB folder | R-2 |
| 3 | A relative path is retried under `/bookshelf/`; a made-up name is fetched to detect "not found" pages | pointless requests to `calendar/php/` on every open | R-3 |
| 4 | A failed open shows the default or sample book | a student who may not see a page yet gets *Alice* or the folder's default | R-4 |
| 5 | Position and draft keys use the path only | every course page would share one saved position | R-5 |
| 6 | The title falls back to the file name | pages without a heading are titled "html.php" | R-6 |
| 7 | Addresses in the page are paths in the book's folder | `get.php?file=KEY` loses its key: pictures, media and style sheets vanish | R-7 |
| 8 | A non-web link is an in-book link | `#/view/KEY` does nothing; a link to a file gives "isn't part of the book's reading order" | R-8 |
| 9 | The Edit button and `?edit=` work on the text as fetched | the processed HTML would be offered for editing as if it were the source | R-9 |
| 10 | The reader is a whole page with Open, Edit, drag and drop | a visitor can leave the course for any file; there is no way back | R-10, R-11 |
| 11 | Forms can not be sent (sandbox and `form-action 'none'`) | "Enter the code to see this section" does nothing | R-12 |
| 12 | No math or code highlighting | `\( … \)` shows as typed; code is plain | R-13 |
| 13 | Scripts are removed | pages that build themselves with their own scripts show nothing of that | R-14 |
| 14 | Saved audio and positions are per browser, not per viewer | narration of instructor-only text stays in the browser after logging out | R-15 |

**What already fits, and should be kept as it is:**

- Fetches are same-site with cookies, so `html.php` answers for the signed-in viewer.
- The frame keeps `allow-same-origin`, so pictures from `get.php` carry the session too.
- Scripts in a page never run. This site's own page view runs them, in the app's own scope;
  the reader is the safer of the two for anything an instructor did not write themselves.
- External links open in a new tab; nothing in a page can navigate the reader away.
- Heading ids and the contents list, which is what the site's "On this page" outline does.
- `details.cal6-student` needs no script. (Check that opening one re-flows the pages in the
  two- and one-column layouts; if not, it is a small fix of its own.)
- `[data-cal6-hidden]` elements have no `href`: they are already plain text to the reader.
- `html.php` and `get.php` sit in the same folder, so the page policy's "the document's
  folder" happens to allow `get.php` already. R-7 should say so on purpose.

---

## 5. Suggested changes to epub-reader

Each is off unless configured, so a reader without the configuration is unchanged. Names of
settings are suggestions.

### Opening

**R-1. Open an address that has a query string.** Keep `?book=` as it is, and add a
*source*: a named address template in `reader-config.json` (`SOURCES`, see section 6),
opened with `?src=<name>&key=<KEY>`. The reader fills the template, keeps any further
parameters of its own address that the source lists as passed on (for `html.php`'s `<url>`
values), and fetches that one address. Reasons for a template over "stop clearing the
query":

- the site, not the link, says which endpoints may be fetched (today `?book=` can already
  fetch any path on the site; an endpoint with parameters is a wider door);
- the key can be checked against a pattern (`^[A-Za-z0-9_-]{22}$`) before anything is sent;
- link routes (R-8) and resource rules (R-7) hang off the same entry.

Same site only, as `?book=`; a redirect to another site is refused, as now.

**R-2. Take the kind from the source, then the answer.** A source states its `kind`
(`"html"` here: Markdown arrives converted and must **not** go through marked again).
Independently, let `fetchDocument()` pass the response's `Content-Type` to `docKind()`,
which already takes it, so an address without a telling extension works in `?book=` and
`?get=` too.

**R-3. No guessing for a source.** Skip the `/bookshelf/` second try, the "extracted EPUB
folder" attempt and the soft not-found probe: the endpoint answers with real status codes.

**R-4. An error page instead of another book.** For a source, show a page of the reader's
own in place of the document: the status in plain words, the server's `{"error"}` message
when there is one, and the way back (R-11). A source can give the wording per status
(`404` here means "not available yet, or you need to log in"). No default book, no sample.
Worth having standalone as well, as an option (`ON_MISSING: "error"`), for sites that would
rather not show a sample book on a mistyped link.

### Identity

**R-5. Keys that include the query.** Position and draft keys for a source:
`spine:pos:src:<name>:<key>`, and for `?book=` with a query (if R-2 makes that possible) the
path and query together. Otherwise every page behind one endpoint shares a position.

**R-6. A title that is given.** Accept `&title=` (plain text, shown with `textContent`),
used when the document has no `<title>`; then the first heading; then the source's label,
never "html.php". The site knows the event's title from `calendar.php`. An optional
`&subtitle=` ("Class 5 · Aug 31") would fill the place an author has for a book.

### Addresses inside the page

**R-7. Resource addresses the source vouches for.** In `localize()` and `rewriteCss()`,
before treating an address as a path in the book: if it is same-site and matches one of the
source's `resources` patterns (for this site, the path of `get.php` with a `file` key),
leave it exactly as written, query included. Add those endpoints to `bookPolicy()`'s
`img-src`, `media-src` and `font-src` by name. Style sheets linked from the head are
fetched and rewritten by the reader, so their address must keep its query on the way to
`fetch()`. Everything else stays as strict as now: unknown addresses are still removed.

**R-8. Link routes.** A source lists patterns for links and what each does:

| Link in the page | Action |
|---|---|
| `#/view/KEY[?query][#frag]` | open that key in the reader (same source), with the query passed on and the fragment as the place to go; `history.pushState`, so Back returns |
| a `resources` address (`get.php?file=KEY`) | open in a new tab, as web links do |
| `#id` | as now |
| anything else that is not a web link | as now (no target) |

`markLinks()` is the place: today `#/view/KEY` falls into the `#` branch and is treated as
an id on the current page. In a frame (R-10) the reader can instead tell the host page and
let it decide.

### Being part of another site

**R-9. No editing of what a source returns.** The text is the processed page, not the
file. Hide Edit and refuse `?edit=` for sources regardless of `EDITING`. (Saving a course
file would be E-22's business, against the real file, and is not suggested here.)

**R-10. A plain mode.** `CHROME` in the folder's config (or `&embed=1`, only where the
config allows it): no Open button, no drag and drop, no Edit, no default book, no "Spine
Reader" title. The reading controls stay: contents, search, layout, font, size, theme, read
aloud. With it, a small message interface for a host page on the same site, checked by
origin:

| From the reader | When |
|---|---|
| `{type: 'spine:ready', title}` | a document is shown |
| `{type: 'spine:navigate', route}` | a link matched a route the host should handle |
| `{type: 'spine:error', status}` | the document could not be opened |

| To the reader | Effect |
|---|---|
| `{type: 'spine:theme', theme}` | follow the host's light or dark choice |

The nginx example already sends `frame-ancestors 'self'`, which allows this.

**R-11. A way back.** `&back=<address>` (same site only, checked) shown as a Back control
in the top bar and on the error page; or the source's `back` template. Without a frame this
is the only way a reader returns to the calendar.

**R-12. Forms the source names.** The reader page can reach into the frame (same origin),
so it can do this without loosening the sandbox: for forms matching the source's `forms`
selector (`form.cal6-lock`), take the submit, send the fields itself with `fetch` (`POST`,
`FormData`, to the form's own `action` if that is a `resources`/source address), follow the
redirect, and show the answer as the document. `403` → fetch the page again (the token
expired); `429` → "try again later". Forms that are not named stay inert, as now.

### Course-page features

**R-13. Math and code, done outside the frame.** Scripts can not run in the page frame and
should not start to. Both can be done on the text before it is shown, as marked is:

- code: highlight.js's `highlight(code, {language}).value` returns markup; the theme's CSS
  goes into the page's style. Loaded on demand through `LIBS` with an integrity hash and
  fetched by `fetch-libs.sh`, like marked;
- math: MathJax (or KaTeX) converting `\( \)`, `\[ \]`, `$$ $$` to MathML or SVG as a string.
  Read-aloud needs a rule for it (skip, or read the source).

Both improve standalone Markdown and HTML reading too, so they are worth having whatever
happens here. Until they exist, pages with math or code read worse in the reader than in
the site's own view.

**R-14. Say when a page wanted its scripts.** Keep removing them. When a source document
had scripts (other than known harmless ones), show a quiet note with a link to open the page
in the host's own view (`spine:navigate` or the `back` address). This is the honest limit
for HTML pages, and one reason to start with Markdown.

**R-15. Material that depends on who is logged in.** For a source marked `private`: do not
keep natural-voice audio in IndexedDB past the session (or key it by an opaque viewer value
the host passes in), and do not offer audiobook export unless the config allows it. Reading
positions are harmless (a key and a number).

**R-16. Tests.** `tests/server.py` gains a small endpoint that answers like `html.php` and
`get.php` (keys, a 404 with JSON, a 303 for a form), and tests cover: the query kept; kind
from the source and from `Content-Type`; no `/bookshelf/` or probe request; distinct
position keys; pictures and style sheets by key; each link route; the error page; the
unlock form; plain mode; and that every existing test still passes with no `SOURCES`.

---

## 6. A configuration for this site

What `epub-reader/reader-config.json` might look like once R-1 to R-12 exist (names are
suggestions, addresses relative to the reader's folder):

```json
{
  "EDITING": false,
  "GET_URLS": false,
  "ALLOW_CDN": false,
  "CHROME": "plain",
  "SOURCES": {
    "course": {
      "open": "../calendar/php/html.php?file={key}",
      "key": "^[A-Za-z0-9_-]{22}$",
      "kind": "html",
      "pass": true,
      "private": true,
      "resources": ["../calendar/php/get.php"],
      "routes": [
        {"link": "^#/view/([A-Za-z0-9_-]{22})(\\?[^#]*)?(#.*)?$", "open": "course"}
      ],
      "forms": "form.cal6-lock",
      "back": "../#/view/{key}",
      "errors": {"404": "This page is not available yet, or you need to log in."}
    }
  },
  "LOCKED": ["ALLOW_REMOTE_CONTENT"]
}
```

and a page would be opened with:

```
epub-reader/index.html?src=course&key=8IKYqrlL_M-XcogU0C6cZ7&title=SQL%20SELECT
```

---

## 7. What calendar6-demo would change

Small, and only once the reader can do the above:

- **Where it lives.** `epub-reader/` in the course directory (ignored by git, as now), with
  its libraries and fonts fetched (`fetch-libs.sh`, `fetch-fonts.sh`) so nothing loads from
  another site, and the `reader-config.json` above.
- **Which pages go to it.** `calendar.php` gives each box file its `filename`: a box or
  page ending in `.md` opens in the reader, others in the site's own view, until HTML is
  moved over. A setting in the app (`READER = 'markdown' | 'all' | 'off'`) keeps this in one
  place.
- **How.** Either a link to the reader with `back` set to the event (simplest), or the
  reader in a frame under the event header and tabs, which keeps the top bar, the Events
  menu and the event's tabs on screen (needs R-10).
- **The web server.** The reader's policy from `nginx.conf.example` as Apache directives
  for `epub-reader/` (an `.htaccess` example would be a useful addition to epub-reader). The
  course root's `.htaccess` refuses `.md` files anywhere under the course, which also covers
  the reader's own `README.md`; that is fine.
- **`DESIGN.md`** gains a section on the reader.

---

## 8. Order of work

| Phase | Changes | Result |
|---|---|---|
| 1. Markdown pages, as a link | R-1, R-2, R-3, R-4, R-5, R-6, R-7, R-8, R-9, R-11, R-16 | a course Markdown page opens in the reader, with its pictures, links to other pages and a way back |
| 2. Inside the site | R-10, R-15 | the reader sits under the event header; themes follow the site |
| 3. HTML pages | R-12, R-13, R-14 | unlock forms, math and code; pages that need their own scripts are sent to the site's view |

Phase 1 is the smallest set that is useful and safe. R-13 is the largest single piece and
is independent of the rest.

---

## 9. Open questions

- **Markdown with math or code.** Course Markdown may well contain both. If so, R-13 belongs
  in phase 1, or those pages stay in the site's view until it is done.
- **Frame or link?** A link is far less work and gives the reader the whole screen; a frame
  keeps the course's navigation visible. Phase 1 works either way.
- **One source or several?** If other sites would use the same idea, `SOURCES` earns its
  generality; if calendar6 is the only one, a single `SOURCE` entry is simpler.
- **Does `<details>` re-flow in the paged layouts?** Not checked; "Show answer" blocks are
  common in course pages.
- **Whose audio is it?** R-15 is cautious. If instructors never use read-aloud on unreleased
  material, it can be left out.
