# calendar6-demo: design

How this repository was built and why it looks the way it does, written so the whole thing
could be recreated from scratch. `README.md` says how to run it; calendar6's `API.md` is the
contract for the five endpoints it uses.

Contents: [1. What this is](#1-what-this-is) · [2. Recreating the repository](#2-recreating-the-repository) ·
[3. Ground rules](#3-ground-rules) · [4. Files](#4-files) · [5. The top bar](#5-the-top-bar) ·
[6. The calendar](#6-the-calendar) · [7. Events](#7-events) · [8. Course pages](#8-course-pages) ·
[9. Logging in](#9-logging-in) · [10. Data and freshness](#10-data-and-freshness) ·
[11. Testing](#11-testing) · [12. Lessons learned](#12-lessons-learned) · [13. Not built yet](#13-not-built-yet)

---

## 1. What this is

A course web site for several instructors to use: a static front end (one HTML page, one
JavaScript module, one style sheet) on top of [calendar6](https://github.com/jskenney/calendar6),
whose PHP endpoints decide who may see what. The old SD321 course
([jskenney/SD321](https://github.com/jskenney/SD321)) is the test material.

Only the front end, the demo's configuration and a few tools live in this repository. The
calendar6 software, the course material and the live `config/` are fetched or generated
next to it and kept out of git.

---

## 2. Recreating the repository

### 2.1 The course directory

Starting from an empty `calendar6-demo` checkout:

1. **`.gitignore`** with these lines, so nothing below is committed:

   ```
   calendar
   calendar6/
   class/
   config/
   lab/
   project/
   pages/
   SD321/
   ```

2. **The software:** clone `jskenney/calendar6` into `calendar6/`, and link it as `calendar`
   (the endpoints insist on being reached as `<course>/calendar/php/…`):

   ```bash
   git clone --depth 1 https://github.com/jskenney/calendar6 calendar6
   ```

   ```bash
   ln -s calendar6 calendar
   ```

3. **The configuration:** copy `calendar6/template/config` to `config/`.
4. **The material:** clone `jskenney/SD321` into `SD321/`, and copy its `class/`, `lab/` and
   `project/` directories to the root.
5. **The pages:** make `pages/`; copy `SD321/home.html` and `SD321/resources.html` into it,
   and `SD321/policy.html` as `pages/syllabus.html` (the names `config/paths.ini` expects).

`setup.sh` does all of this, and never overwrites a directory that already exists.

### 2.2 Making the template configuration fit SD321

The template describes an imaginary course, so `config/` needs these changes. They are kept
in `setup/sd321-config/` (committed) and copied over `config/` (ignored) by `setup.sh`:

| File | What changed, and why |
|---|---|
| `config.ini` `[course]` | number `SD321`, name `Data Storage`, and a real `secret` (`php -r 'echo bin2hex(random_bytes(32));'`): without one every endpoint answers 500 |
| `config.ini` `[semester]`, `[schedule]` | 2026-08-17 to 2026-12-18; `mon = class`, `wed = class`, `thu = lab`, as the old course met. 26 class folders and 12 lab folders fit |
| `config.ini` `[boxes]` | SD321's file names: `title = index.html, actual_lab.html` (labs have no `index.html`), `homework-solution = answers.html`, `lab-solution = actual_solution.html, labanswers.html`. The `title` box is labelled "Lesson" so it is not confused with notes |
| `config.ini` `[notes]` | `notes = notes.txt, …` and a second one, `reading = reading.txt`, which SD321 uses |
| `config.ini` `[dropdown]` | `show = class, lab, project`: the event types in the Events menu |
| `config.ini` `[replace]` | the values SD321's pages use: `classyear`, `classyear2`, `classyearplebe`, `due`, `server`, `servershort`, `answerserver` |
| `dates.ini` | holidays, a Monday-schedule day, an early schedule and a 2-hour delay, and four `project` days (projects have no weekday of their own, so each of the four project folders gets a date here) |
| `default.ini` | release rules with some of everything: classes open the Monday before, labs on the day, lab solutions a week later, so the calendar shows both open and not-yet-open events |
| `sections.ini` | three made-up sections (`1001`, `3001`, `5001`) with `MW<n> class, R<nn> lab` meetings, to exercise times and rooms |
| `auth/<user>.ini` | not in the repository at all: make one per account (see `README.md`) |

The section numbers, instructor names, rooms and dates are placeholders.

### 2.3 What to commit

`index.html`, `app/`, `.htaccess` (calendar6's course-root rules, copied from
`calendar6/template/.htaccess`), `setup.sh`, `setup/sd321-config/`, `tools/dev-router.php`,
`README.md` and this file. Nothing is ever committed to `calendar6` or `SD321`.

### 2.4 The order it was built in

Each step was tried in a browser before the next:

1. The first pass: weeks grid and list, event pages, course pages, sections, code and math.
2. Top-bar page links taken from `calendar.php` → `pages`.
3. Event drop-downs from `calendar.php` → `dropdown` (one per type at first).
4. Logging in and out, and what instructors see.
5. One combined Events menu (event types under headings, sections at the bottom).
6. Notes on the calendar.

---

## 3. Ground rules

These shaped everything else.

- **Every course file comes through an endpoint, by key.** Pages through `html.php?file=KEY`,
  everything else through `get.php?file=KEY`. The app never builds a path into `class/`,
  `lab/`, `project/`, `pages/` or `config/`; those are assumed to be blocked by `.htaccess`
  whether or not the file is there. `tools/dev-router.php` blocks them under PHP's built-in
  server so that a mistake shows up locally as a 403.
- **The server decides; the front end only draws.** What is in the menu, which events can be
  opened and what an instructor sees all come from `config.php` and `calendar.php`. The app
  keeps no list of its own.
- **No build step and no framework.** One ES module and one style sheet, readable as they
  are. DOM is built with a small `h(tag, attrs, …children)` helper in which strings always
  become text nodes, because every string in the JSON is plain text, not HTML.
- **One host.** highlight.js and MathJax are vendored in `app/vendor/` instead of loaded from
  a CDN, so the site works on a closed network and sends nothing elsewhere.
- **`#` routes**, so every view is a static page and can be bookmarked:
  `#/` (calendar), `#/event/<id>[/<box>]`, `#/page/<name>`, and `#/view/<KEY>`, the form
  `html.php` writes for links between pages.

---

## 4. Files

| File | Holds |
|---|---|
| `index.html` | the fixed frame: the top bar's empty slots, `<main>`, and the log-in dialog |
| `app/app.js` | everything else, in sections: helpers, dates, data, logging in, header, routing, calendar, events, pages, code and math, start |
| `app/app.css` | colours as custom properties (light, and dark through `prefers-color-scheme`), then one block per part of the page |
| `app/vendor/` | highlight.js (common languages, GitHub light and dark themes) and MathJax 3 `tex-chtml` with its fonts |

Dates are handled as plain `YYYY-MM-DD` strings, compared as strings and stepped through UTC,
so the browser's own timezone never moves a day. "Today" is worked out in the course's
timezone (`config.php` → `course.timezone`).

Event types get a colour by their position in `config.php` → `types` (classes `t0`…`t5`,
each setting `--tc`), so a course with different type names is coloured without any change.

---

## 5. The top bar

The bar is sticky and holds, left to right:

```
[ SD321  Data Storage ]  [ Calendar | Home | Resources | Syllabus ]        [ Events ▾ ] [ Log in ]
   brand                    page links                                        menu         viewer
```

| Part | Comes from | Behaviour |
|---|---|---|
| Brand | `config.php` → `course.number`, `course.name` | links to the calendar; the name is dropped on narrow screens |
| Calendar | fixed | always first |
| Page links | **`calendar.php` → `pages`**, every entry, in its order, labelled with its `title` | `#/page/<name>`; a page without a `key` (the viewer may not open it) is shown dimmed and leads to a short notice |
| Events menu | **`calendar.php` → `dropdown`**, and `config.php` → `sections` | see below; hidden when there are neither types nor sections |
| Viewer | `config.php` → `viewer` | "Log in", or the username (with an "Instructor" tag) and "Log out" |

**The Events menu** is a single button opening one panel, built as a custom panel rather
than a `<select>` so it can hold headings, links and a choice in one place:

- one block per event type in `dropdown`, **in that order**, each under a sticky heading in
  the type's colour; rows show number, title and date, and link to the event;
- events with nothing to open yet are greyed out and not clickable;
- **Section last**: "All sections (no times)" and each section with its instructor; the
  current one is checked, and its number is shown on the button itself so the choice is
  visible with the menu closed. Choosing one is remembered (`localStorage`) and refetches
  `calendar.php?section=N`;
- it opens scrolled to the event being read, or to the next one coming up; Escape, a click
  outside or choosing a row closes it. On a phone the panel spans the screen width.

This replaced an earlier layout with one drop-down per type plus a separate Section picker,
which made the bar too busy.

**Layout rules.** The bar is a wrapping flex row: the page links take the free space and the
tools are pushed right; if they do not fit they wrap to a second row instead of squeezing the
links. Because the height can therefore change, a `ResizeObserver` writes the bar's real
height into the CSS variable `--header-h`, which everything that sticks or scrolls below the
bar uses (the weekday row, the page outline, anchor scrolling). The bar itself must never
read that variable (see [12](#12-lessons-learned)).

---

## 6. The calendar

The home view, drawn entirely from `calendar.php` → `days` and `events`. Top to bottom:

1. **Up next.** A card for each event on the next day that has any (today counts), with its
   time and room when a section is chosen, its notes, and a link per box. It answers "what
   do I need right now" without reading the grid.
2. **Toolbar.** "Today" (scrolls to it), a Weeks / List switch (remembered), one toggle per
   event type in use (also the colour legend), and a title filter.
3. **The body**, in one of two forms.

**Weeks grid.** One row per week of the semester, one column per weekday (five, or seven
when `semester.weekends` is true). A left gutter carries the week number and the month name
when it changes. This shape was chosen over a month-at-a-time calendar because a course is a
run of weeks: the whole semester scrolls as one page with no paging between months.

- Weeks before last week are folded behind "Show N earlier weeks", so the page opens on the
  present without scrolling past August. A title filter searches the whole semester.
- Today has an outline and a filled date; the current week has a marked gutter; past days are
  slightly muted; days outside the semester are hatched.
- A day's **marker** (`"event": ""` in `days`) supplies its label: holidays are tinted, and a
  different period schedule shows that schedule's label.

**List.** The same weeks as cards, one row per day that has something, with full titles,
times, rooms and instructors. It is the default on screens under 760 px, where grid cells
are too narrow.

**An event on the calendar** is a "chip" in its type's colour:

- "Class 5", the start time when a section is chosen, and the title; it links to the event;
- nothing to open yet → dashed outline, muted, not a link (the title is still shown, as
  `calendar.php` gives titles to everyone);
- a cancelled meeting → struck through with a "Cancelled" flag;
- for logged-on viewers, "Hidden" when students can not open any of it yet;
- under the chip, a small link per further box (Answers, Solution, Slides…), so a solution
  is one click from the calendar;
- under those, the event's **notes**: up to four lines in the grid, in full in the list.
  Text from `notes.*` is shown as is; another notes file is labelled by its name
  ("Reading: …").

Notes are the file as written, so they are never inserted as HTML: text, simple formatting
(`b`, `i`, `em`, `strong`, `code`, `br`) and `http(s)` links are rebuilt node by node, and
everything else is dropped.

**Instructors** get a panel under the calendar: the `problems` `calendar.php` reports
(folded, with a count), and any events with `date: null` (more folders than days).

---

## 7. Events

`#/event/<id>` shows a header and then the event's material:

- **Header:** a bar in the type's colour, "← Calendar", Previous / Next within the same type,
  the title, the date, and time · room · instructor when a section is chosen. Notes follow as
  labelled blocks.
- **Tabs:** one per box, in `config.php` → `boxes` order. A box of `kind: "html"` is shown in
  place through `html.php`; any other file gets Open and Download buttons (`get.php`, with
  `download=1` for the second) and, for a PDF, is shown in a frame.

`#/view/<KEY>` is the same view: the app keeps a map from every key in `calendar.php` to its
event and box (or page), so a link inside one page to another lands on the right event with
its header and tabs.

---

## 8. Course pages

Showing what `html.php` returns follows calendar6's `API.md` §10.4:

1. **Parse, don't paste.** The answer is parsed with `DOMParser` (it may be a fragment or a
   whole document); the body's children are moved into the page container, followed by the
   head's styles, style sheets and scripts. `<title>`, `<base>` and `<meta>` are dropped.
2. **Styles are fenced in.** A page's own `<style>` is wrapped in `@scope (.doc) { … }` so it
   can not restyle the app, and it goes away with the page.
3. **Scripts are run by hand**, in order, each replaced by a fresh `<script>` (an external
   one is awaited). Handlers a page registers for `DOMContentLoaded` or `load` are collected
   and called afterwards, since those events fired long ago. On a second visit an inline
   script is wrapped in a block, so top-level `let`/`const`/`class` do not fail as "already
   declared".
4. **Links.** `#/view/KEY` links are routes already. `#anchor` links scroll within the page
   (they must not become routes). File and external links open in a new tab.
5. **Extras.** An "On this page" outline is built from the headings when there are at least
   three. highlight.js and MathJax are loaded only when a page has code blocks or math.
   Wide tables scroll sideways inside their own box.
6. **What `html.php` inserts** is styled: `details.cal6-student` ("Show answer"),
   `form.cal6-lock` (sent with `fetch`, the page redrawn from the answer),
   `[data-cal6-hidden]` as plain text, `pre.cal6-ace`, `.cal6-error`.

SD321's pages were written for a 12-column grid (`row`, `six columns`, …); a small set of
compatible rules under `.doc` keeps their two-column layouts working.

---

## 9. Logging in

Students never log in. "Log in" opens a `<dialog>` with a username and password.

1. Opening it fetches a token with `config.php?csrf=1`.
2. The form posts JSON to `auth.php`. A 403 (expired token) fetches a new token and tries
   once more; 401 shows the server's message and keeps the form open; 429 says how long to
   wait.
3. After a login or logout, `config.php` and `calendar.php` are fetched again and the current
   view is redrawn in place, because everything the viewer may see can have changed.
4. A timer set for `viewer.valid_until` does the same when a login ends by itself.

Logged-on viewers see what students can not open yet marked with a dashed outline and
"Hidden", with the opening time as a tooltip when there is one. A page that can not be
opened offers "Log in" when the viewer is anonymous.

---

## 10. Data and freshness

- Start-up sends `config.php` and `calendar.php` together and draws when both are back.
- `calendar.php` is fetched again when the tab becomes visible (if a minute has passed) and
  every five minutes. The body is compared with the last one, and the calendar is redrawn
  only if it changed and only while the calendar is the view on screen, so a page being read
  is never redrawn under the reader.
- A changed `version.software` in `config.php` reloads the app.
- Remembered in `localStorage`: the section and the Weeks / List choice. A remembered section
  that no longer exists (404) is forgotten.
- Navigation carries a token: an answer that arrives after the reader has moved on is
  ignored.

---

## 11. Testing

There is no test suite in the repository yet. Each step was checked by driving the site in
headless Chromium against the SD321 course under `tools/dev-router.php`:

- every event page and course page opened in turn, failing on any JavaScript error, any
  response of 400 or more, and **any request to `class/`, `lab/`, `project/`, `pages/` or
  `config/`**;
- screenshots at desktop and phone widths;
- for logging in: two throwaway accounts in the local `config/auth/` (an instructor, and a
  staff account with lab grants).

---

## 12. Lessons learned

- **A measured value must not feed what it measures.** The bar's minimum height once used
  `--header-h`, which was measured from the bar; with its one-pixel border it grew a pixel
  per measurement until it filled the page. The bar now has a fixed minimum height.
- **`replaceChildren()` does not flatten arrays** the way the `h()` helper does: spread them.
- **An empty `pages` in `calendar.php` is usually a missing file**, not a front-end fault:
  `pages/` and `config/` are not in git, and calendar6 leaves out a page whose file is
  missing.
- **A box label is global**, so a `title` box labelled "Notes" collides with the notes file;
  hence "Lesson".
- **Empty notes files exist** (SD321 has some): they are skipped rather than drawn as an
  empty block.

---

## 13. Not built yet

- The instructor preview that `calendar.php` supports (`as=` a viewer, `at=` a moment).
- An automated test suite in the repository.
- Untested for want of material in SD321: lock-code forms, PDF and download boxes, events
  that do not fit on the calendar, and the automatic return to the anonymous view when a
  login expires.
- `pages/syllabus.html` links to a policy PDF that lives in the SD321 root and is not copied
  by the set-up steps, so that link is dead.
