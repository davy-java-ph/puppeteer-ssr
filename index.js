const ssr = require('./main');


ssr().subscribe(result => {
    console.log(result);
});