#! /usr/bin/env node
const {reduce,tap}= require("rxjs/operators");
const ssr = require('./main');
console.log('begin ...');
ssr().pipe(tap((result)=>{
    console.log(`${Object.keys(result)} done...`);
}),reduce((current,pre)=>{
    return Object.assign(current || {}, pre || {});
})).subscribe((result) => {
    console.log(`All Done.`);
});