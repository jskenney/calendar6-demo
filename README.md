# calendar6-demo

A course web site built on [calendar6](https://github.com/jskenney/calendar6): a static
front end (`index.html` + `app/`) that talks only to calendar6's five PHP endpoints. The
old SD321 course is used as test material.

## What is in this repository

```
index.html            the page: header, navigation, one <main>
app/app.js            the whole front end (plain ES module, no build step)
app/app.css           its styles (light and dark)
app/vendor/           highlight.js and MathJax, loaded only by pages that need them
.htaccess             calendar6's course-root rules (no dot files, .ini, .md, stray PHP)
setup.sh              builds the SD321 demo course around this checkout
setup/sd321-config/   the demo course's .ini files (copied into config/ by setup.sh)
tools/dev-router.php  router for PHP's built-in server that refuses what .htaccess refuses
```

Not in the repository (see `.gitignore`): `calendar6/` and the `calendar` link to it,
`config/`, the material (`class/`, `lab/`, `project/`, `pages/`) and the `SD321/` clone.

## Running the demo

```bash
./setup.sh
```

```bash
php -S localhost:8000 tools/dev-router.php
```

Then open <http://localhost:8000/>. PHP 8.3 or newer.

## How the front end uses the endpoints

| Endpoint | Used for |
|---|---|
| `config.php` | course name, event types, box labels and order, pages menu, sections, period schedule labels |
| `calendar.php[?section=N]` | every day and event, and the keys of the files this viewer may open; fetched again when the tab becomes visible and every 5 minutes |
| `html.php?file=KEY` | every course page (event pages, home, resources, syllabus), parsed and placed in the app |
| `get.php?file=KEY` | every other file: links inside pages (already rewritten by `html.php`) and non-page boxes such as PDFs |
| `auth.php` | not used yet (no login form); a logged-in viewer is shown if there is one |

No course file is ever requested by path: `class/`, `lab/`, `project/`, `pages/` and
`config/` are assumed to be blocked, and `tools/dev-router.php` blocks them locally.

Routes: `#/` (calendar), `#/event/<id>[/<box>]`, `#/page/<name>`, and `#/view/<KEY>`
(the links `html.php` writes).
