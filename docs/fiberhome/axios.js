function encryptFunc(a, b, c) {
    var b = CryptoJS.enc.Utf8.parse(b);
    var c = CryptoJS.enc.Utf8.parse(c);
    var d = "";
    if (typeof a == "string") {
        var e = CryptoJS.enc.Utf8.parse(a);
        d = CryptoJS.AES.encrypt(e, b, {
            iv: c,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        })
    } else if (typeof a == "object") {
        data = JSON.stringify(a);
        var e = CryptoJS.enc.Utf8.parse(data);
        d = CryptoJS.AES.encrypt(e, b, {
            iv: c,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        })
    }
    return d.ciphertext.toString()
}
function decryptFunc(a, b, c) {
    var b = CryptoJS.enc.Utf8.parse(b);
    var c = CryptoJS.enc.Utf8.parse(c);
    var d = CryptoJS.enc.Hex.parse(a);
    var e = CryptoJS.enc.Base64.stringify(d);
    var f = CryptoJS.AES.decrypt(e, b, {
        iv: c,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    var g = f.toString(CryptoJS.enc.Utf8);
    return g.toString()
}
function int_aes_iv() {
    var a = "";
    for (var i = 0; i < 16; i++) {
        a += String.fromCharCode(i + 112)
    }
    return a
}
var g_http_posting = false;
var aes_encrypt_enable = 1;
var requestPath = "/api/tmp/";
var requestLongPath = "/api/long/";
var downloadPath = "/api/download/";
var loginoutPath = "/api/sign/";
var requestCheckApi = "FHAPIS";
var requestNoCheckApi = "FHNCAPIS";
var requestUpApi = "FHUPAPIS";
var requestIsLoggedIn = "IS_LOGGED_IN";
var requestupurl = requestPath + requestUpApi;
var iv = int_aes_iv();
var key;
var instance = axios.create();
function getToken() {
    return instance({
        url: requestPath + requestNoCheckApi + "?ajaxmethod=get_refresh_sessionid&_=" + Math.random(),
        type: 'get'
    })
}
function complatePostConfig(a, b) {
    var c = b.data.sessionid;
    var d = a.data;
    d.sessionid = c;
    var e = JSON.stringify(d);
    if (aes_encrypt_enable == 1) {
        key = c.substring(0, 16);
        a.data = encryptFunc(e, key, iv)
    } else {
        a.data = e
    }
    return a
}
function editPostConfig(a) {
    return getToken().then(function(k) {
        if (k.status == 200) {
            return complatePostConfig(a, k)
        } else {
            return new Promise(function(b) {
                setTimeout(function() {
                    b(editPostConfig(a))
                }, 100)
            }
            )
        }
    })
}
axios.defaults.timeout = 30000;
axios.defaults.headers['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
axios.defaults.headers['Content-Type'] = 'application/json; charset=utf-8';
axios.interceptors.request.use(function(a) {
    if (a.method === 'post') {
        return editPostConfig(a)
    } else {
        return a
    }
}, function(a) {
    return Promise.reject(a)
});
axios.interceptors.response.use(function(e) {
    return new Promise(function(a) {
        var b = e.config.method;
        var c = e.config.url;
        var d;
        if (aes_encrypt_enable == 1 && b == "post" && c.indexOf(loginoutPath) == -1) {
            d = JSON.parse(decryptFunc(e.data, key, iv))
        } else {
            d = e.data
        }
        a(d)
    }
    )
}, function(b) {
    if (b && b.response) {
        if (b.response.status == "418") {
            try {
                locationOut()
            } catch (e) {
                window.location = "/"
            }
        } else if (b.response.status == "417") {
            alert(g_this.$t("userLogged"));
            try {
                locationOut()
            } catch (e) {
                window.location = "/"
            }
        }
        var c = {
            400: '错误请求',
            403: '拒绝访问',
            404: '请求错误，未找到资源',
            501: '网络未实现',
            502: '服务不可用'
        };
        b.message = c[b.response.status] || '其他错误' + b.response.status
    } else {
        b.message = '连接到服务器失败'
    }
    var d = {
        ERRORSTATUS: b && b.response ? b.response.status : 'failed',
        message: b.message
    };
    return new Promise(function(a) {
        a(d)
    }
    )
});
function $get(d, e, f) {
    var g = {
        "ajaxmethod": d,
        "_": Math.random()
    };
    var h = requestPath + requestCheckApi;
    if (e == "nocheck") {
        h = requestPath + requestNoCheckApi
    }
    var i = 30000;
    if (f && Number(f) > 5000) {
        i = Number(f)
    }
    if (d == "heartbeat") {
        h = requestPath + d;
        g = {
            "_": Math.random()
        }
    }
    return new Promise(function(b, c) {
        axios({
            method: 'get',
            url: h,
            params: g,
            timeout: i,
            headers: {}
        }).then(function(a) {
            b(a)
        })
    }
    )
}
function webSendHttpPost(d, e, f, g) {
    g_http_posting = true;
    return new Promise(function(b, c) {
        axios({
            method: "post",
            async: true,
            url: d,
            data: e,
            timeout: g,
            headers: {
                "Content-Type": f || "application/json; charset=utf-8"
            }
        }).then(function(a) {
            g_http_posting = false;
            b(a)
        })
    }
    )
}
function webHttpPost(b, c, d, e) {
    if (g_http_posting) {
        return new Promise(function(a) {
            setTimeout(function() {
                a(webHttpPost(b, c, d, e))
            }, 50)
        }
        )
    } else {
        return webSendHttpPost(b, c, d, e)
    }
}
function $post(a, b, c, d, e, f) {
    var g = {};
    g.dataObj = b;
    g.ajaxmethod = a;
    var h = 30000;
    if (e && Number(e) > 5000) {
        h = Number(e)
    }
    var i = requestPath;
    if (d == 1) {
        i = requestLongPath;
        h = 300000
    }
    var j = requestCheckApi;
    if (c == "nocheck") {
        j = requestNoCheckApi
    }
    if (a == "DO_WEB_LOGIN" || a == "DO_WEB_LOGOUT") {
        i = loginoutPath;
        j = a
    }
    var k = i + j + "?_" + Math.random();
    return webHttpPost(k, g, f, h)
}
function isJson(a) {
    var b = typeof (a) == "object" && Object.prototype.toString.call(a).toLowerCase() == "[object object]" && !a.length;
    return b
}
function $multipost() {
    var a = {};
    a.ajaxmethod = arguments[0];
    a.multipost = 1;
    a.dataObj = {};
    var b = arguments.length;
    var c = arguments[0].split("|").length;
    for (var i = 1; i <= c; i++) {
        if (typeof arguments[i] == "object") {
            a.dataObj["data_" + i] = arguments[i]
        } else {
            a.dataObj["data_" + i] = {}
        }
    }
    var m = c + 1;
    if (m < b) {
        if (arguments[m] != "check" && arguments[m] != "nocheck") {
            console.error("$multipost参数不对，请检查 !");
            return
        }
        var d = arguments[m]
    }
    if (m + 1 < b) {
        var e = arguments[m + 1]
    }
    if (m + 2 < b) {
        var f = arguments[m + 2]
    }
    if (m + 3 < b) {
        var g = arguments[m + 3]
    }
    var h = 30000;
    if (f && Number(f) > 5000) {
        h = Number(f)
    }
    var j = requestPath;
    if (e == 1) {
        j = requestLongPath;
        h = 300000
    }
    var k = requestCheckApi;
    if (d == "nocheck") {
        k = requestNoCheckApi
    }
    var l = j + k + "?_" + Math.random();
    return webHttpPost(l, a, g, h)
}
function downloadFile(a, b) {
    var c = document.createElement("form");
    c.setAttribute('style', 'display: none');
    c.setAttribute('method', 'GET');
    c.setAttribute('action', downloadPath + a);
    document.body.appendChild(c);
    var d = document.createElement("input");
    d.type = "hidden";
    d.name = "name";
    if (b) {
        d.value = b
    }
    c.appendChild(d);
    c.submit();
    document.body.removeChild(c)
}
function is_other_logged_in() {
    return instance({
        url: requestPath + "loggedin_other_device" + "?_=" + Math.random(),
        type: 'get'
    })
}
function is_logged_in() {
    return instance({
        url: requestPath + requestIsLoggedIn + "?_=" + Math.random(),
        type: 'get'
    })
}
function judgeIsLoggedIn() {
    is_logged_in().then(function(a) {
        if (a && a.data == 0) {
            try {
                locationOut()
            } catch (e) {
                window.location = "/"
            }
        } else if (a.data == -1) {
            alert(g_this.$t("userLogged"));
            try {
                locationOut()
            } catch (e) {
                window.location = "/"
            }
        } else {
            g_device_data.user = a.data;
            $get("get_heartbeat")
        }
    })
}
function initPageConfigure() {
    var e = {
        "ajaxmethod": "is_encrypt",
        "_": Math.random()
    };
    return new Promise(function(d) {
        axios({
            method: 'get',
            url: requestPath + requestNoCheckApi,
            params: e,
            timeout: 30000,
        }).then(function(c) {
            aes_encrypt_enable = c.enable;
            d(new Promise(function(b) {
                if (typeof g_local_xmlfile == "undefined") {
                    $post('get_xmlnode_js_file', null, "nocheck").then(function(a) {
                        window.eval(a.xml);
                        b(true)
                    })
                } else {
                    require(["/js/" + g_local_xmlfile], function() {
                        b(true)
                    })
                }
            }
            ))
        })
    }
    )
}
var g_timeoutinterval;
function checkSessionTimeout() {
    clearInterval(g_timeoutinterval);
    $get('heartbeat').then(function(a) {
        if (a)
            return
    });
    g_timeoutinterval = setInterval(function() {
        $get('heartbeat').then(function(a) {
            if (a)
                return
        })
    }, 3000)
}
