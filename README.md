# puppeteer-multi-page-ssr
基于puppeteer的ssr多页面简单实现


## 配置文件

默认配置文件名`ssr.config.js`,存放在运行文件同级目录

格式
```javascript
module.exports = {
    website: [  //网站
        {
            url: {
                'https://github.com/': './html/github.html'  
            },  //url {网址：预渲染后html存放路径,为空时不保存}
            //页面打开后等待  2000ms
            // （'.carousel-inner .item-img img'|//body/img） 选择器或xpath元素出现
            // () => !!document.querySelector('.foo') 方法返回true，执行上下文为浏览器windows
            waitFor: 1,
            screenshot:'./html/github.png', //页面完全准备就绪后截图记录
            stylesheet: {  //是否执行link css合并到html
                test: /css(\?|$)/,   //需要生成md5的文件规则
                // sameOrigin: true //仅限同源
            },
            javascript: {  //是否执行javascript 合并到html
                test: /js(\?|$)/,   //需要生成md5的文件规则
                sameOrigin: true,  //仅限同源
                level: 3
            },
            base64: {     //是否执行图片base64转换
                test: /(png|jpg)(\?|$)/,   //图片匹配规则
                maxSize: 1024 * 300,     //最大转换多大的图片 1024*1 =1kb
                level: 3
            },
            md5: {               //是否为文件生成md5指纹，防止缓存
                test: /(png|jpg|css|js)(\?|$)/,   //需要生成md5的文件规则
                exclude: /baidu/, //需要跳过的md5文件规则
                //匹配层级，比如当前html页面存在字符串 /../images/home/threeAndOne_commit.png ，实际服务端资源路径存在http://google.com/assets/images/home/threeAndOne_commit.png
                //匹配三级即为 /images/home/threeAndOne_commit.png===/images/home/threeAndOne_commit.png 返回true，被视为同一文件，自动附加md5
                level: 3
            },
            //当html生成后需要过滤的标签，或元素的css选择器或直接编写移除方法（支持Jquery语法）
            excludeList: [($) => $('script[src]').filter((index, item) => /includes\/header/.test($(item).attr("src"))).remove()],
            //最后一步，当最终生成html文件后，自定义替换html内容，返回字符串即为最终替换后的效果 html=>html
            replace: [],
        }
    ]
};
```
使用外置配置文件启动

`node index.js config=./test.js`


## 快速开始

```bash
npm install
npm run start
```


