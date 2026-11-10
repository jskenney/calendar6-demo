#!/bin/sh
# Builds the SD321 demo course around this repository. Everything it creates is in
# .gitignore: the calendar6 software, the SD321 material, and the course's config/.
# Run it once from the repository root; it never overwrites what is already there.
set -eu
cd "$(dirname "$0")"

[ -d calendar6 ] || git clone --depth 1 https://github.com/jskenney/calendar6 calendar6
[ -e calendar ]  || ln -s calendar6 calendar
[ -d SD321 ]     || git clone --depth 1 https://github.com/jskenney/SD321 SD321

if [ ! -d config ]; then
    cp -r calendar6/template/config config
    cp setup/sd321-config/*.ini config/
    secret=$(php -r 'echo bin2hex(random_bytes(32));')
    sed -i "s/REPLACE-WITH-64-HEX-DIGITS/$secret/" config/config.ini
fi

for d in class lab project; do
    [ -d "$d" ] || cp -r "SD321/$d" "$d"
done
if [ ! -d pages ]; then
    mkdir pages
    cp SD321/home.html SD321/resources.html pages/
    cp SD321/policy.html pages/syllabus.html
fi

# The material is only ever served through calendar/php/ (Apache: deny direct access).
for d in config class lab project pages; do
    [ -e "$d/.htaccess" ] || cp calendar6/template/config/.htaccess "$d/.htaccess"
done

echo "Ready. Try it with:  php -S localhost:8000 tools/dev-router.php"
