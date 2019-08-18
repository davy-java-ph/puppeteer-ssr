const {merge, of} = require("rxjs");
const {switchMap, tap} = require("rxjs/operators");
const {fromPromise} = require("rxjs/internal-compatibility");

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const Path = require('path');
const crypto = require('crypto');

let stylesheetContents = {};
let javascriptContents = {};
let md5List = {};
let base64 = {};
var arguments = process.argv.splice(2);
const configArg = "config=";
const configFiles = arguments.filter(item => item.startsWith(configArg)).map(item => item.substring(configArg.length));

async function collectContents(url, config, resp, contents = stylesheetContents) {
    const responseUrl = resp.url();
    const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
    if (config.sameOrigin && !sameOrigin) {
        return false;
    }
    if (config.test && !config.test.test(responseUrl)) {
        return false;
    }
    let text = await resp.text();
    contents[responseUrl] = text;
    return text;
}

async function imgToBase64(config, resp) {
    const responseUrl = resp.url();
    if (config.test && !config.test.test(responseUrl)) {
        return false;
    }
    const buffer = await resp.buffer();
    if (config.maxSize && buffer.length > config.maxSize) {
        return false;
    }
    base64[responseUrl] = "data:image/" + new URL(responseUrl).pathname.replace(/.*\.(\w+)$/, "$1") + ";base64," + buffer.toString('base64');
    return buffer;
}

async function md5(config, resp) {
    const responseUrl = resp.url();
    if (config.test && !config.test.test(responseUrl)) {
        return false;
    }
    if (config.exclude && config.exclude.test(responseUrl)) {
        return false;
    }
    const buffer = await resp.buffer();
    md5List[responseUrl] = crypto.createHash('md5').update(buffer).digest('hex');
    return buffer;
}


async function ssr(url, options = {}, browser) {
    const page = await browser.newPage();
    page.on('response', async resp => {
        if (resp.status() !== 200) {
            return;
        }
        if (resp.request().resourceType() === 'stylesheet' && options.stylesheet && await collectContents(url, options.stylesheet, resp)) {
            return;
        }
        if (options.javascript && await collectContents(url, options.javascript, resp, javascriptContents)) {
            return;
        }
        if (options.base64 && await imgToBase64(options.base64, resp)) {
            return;
        }
        if (options.md5) {
            md5(options.md5, resp);
        }
    });
    await page.goto(url, {waitUntil: 'networkidle0'});
    if (options.waitFor) {
        await page.waitFor(options.waitFor);
    }
    if (Object.keys(stylesheetContents).length) {
        await page.$$eval('link[rel="stylesheet"]', (links, content) => {
            links.forEach(link => {
                const cssText = content[link.href];
                if (cssText) {
                    const style = document.createElement('style');
                    style.setAttribute('data-src', link.href);
                    style.textContent = cssText;
                    link.replaceWith(style);
                }
            });
        }, stylesheetContents);
    }

    if (options.screenshot) {
        await createDir(options.screenshot);
        await page.screenshot({path: options.screenshot, fullPage: true});
    }

    return await page.content();
}

async function createDir(path) {
    const dir = Path.dirname(Path.normalize(path));
    return new Promise((resolve, reject) => {
        fs.mkdir(dir, {recursive: true}, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}


async function createBrowser() {
    return await puppeteer.launch({headless: true, defaultViewport: {width: 2560, height: 1440}});
}


async function htmlHandle(response, config, dist) {
    return new Promise(((resolve, reject) => {
        const $ = cheerio.load(response);
        if (config.excludeList && config.excludeList.length) {
            config.excludeList.forEach(item => {
                if (typeof item === 'function') {
                    item($);
                } else {
                    $(item).remove();
                }
            });
        }
        let javascriptKeys = Object.keys(javascriptContents);
        if (javascriptKeys.length) {
            let level = config.javascript.level || 3;
            let scripts = $('script[src]');
            javascriptKeys.forEach(key => {
                let $scripts = scripts.filter((index, item) => {
                    let src = $(item).attr('src');
                    let paths = key.split('/');
                    let pathString;
                    if (paths.length > level) {
                        paths.splice(0, paths.length - level);
                    }
                    pathString = paths.join('/');
                    return src && src.endsWith(pathString);
                });
                let script = javascriptContents[key];
                script = script.replace(/<script>/gi, encodeURI('<script>')).replace(new RegExp("</script>", 'gi'), encodeURI('</script>'));
                $scripts.removeAttr('src').attr('data-src', key).text(script);
            });
        }
        let html = $.html();
        let base64Keys = Object.keys(base64);
        if (base64Keys.length) {
            let level = config.base64.level || 3;
            base64Keys.forEach(url => {
                let paths = url.split('/');
                if (paths.length > level) {
                    paths.splice(0, paths.length - level);
                }
                let pathString = paths.join('/');
                let regx = new RegExp("(url\\(('|\"|)|src\=('|\"))(.*?" + pathString + ")", 'g');
                html = html.replace(regx, "$1" + base64[url]);
            });
        }

        let md5Keys = Object.keys(md5List);

        if (md5Keys.length) {
            md5Keys.forEach(url => {
                let _url = new URL(url);
                let pathList = _url.pathname.split("/");
                let level = config.md5.level || 3;
                if (pathList.length > level) {
                    pathList.splice(0, pathList.length - level);
                }
                let pathname = pathList.join("/") + _url.search;

                let md5Pathname = `${pathname}${_url.search ? '&' : '?'}_v=${md5List[url]}`;
                html = html.replace(new RegExp(pathname, 'g'), md5Pathname);
            });
        }

        if (config.replace && config.replace.length) {
            config.replace.forEach(item => {
                html = item(html);
            });
        }
        if (!dist) {
            resolve(html);
        } else {
            createDir(dist).then(error => {
                if (error) {
                    reject(error);
                } else {
                    fs.writeFile(dist, html, 'utf-8', err => {
                        if (!err) {
                            resolve(html);
                        } else {
                            reject(err);
                        }
                    });
                }
            });
        }
    }));
}

function ssrWebsite(website, browser) {
    const urlConfig = website.url;
    let ssr$ = [];
    Object.keys(urlConfig).forEach(url => {
        let observable = fromPromise(ssr(url, website, browser)).pipe(switchMap(html => {
            return fromPromise(htmlHandle(html, website, urlConfig[url]));
        }));
        ssr$.push(observable);
    });
    return merge(...ssr$);
}


function readConfig() {
    if (configFiles.length) {
        return require(configFiles[configFiles.length - 1]);
    } else {
        return require(process.cwd() + '/ssr.config');
    }

}


const config = readConfig();

module.exports = () => of(config.website).pipe(switchMap(list => {
    let ssr = [];
    list.forEach(website => {
        ssr.push(fromPromise(createBrowser()).pipe(switchMap(browser => {
            return ssrWebsite(website, browser).pipe(tap(next => {
            }, error => {
                browser.close()
            }, () => browser.close()));
        })));
    });
    return merge(...ssr);
}));

