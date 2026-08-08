/* 浏览器端文件工具：上传存储 + SheetJS 解析（替代 openpyxl + 本地文件系统）。
   浏览器没有本地目录，上传的 Excel 以 base64（data URL）暂存在内存 Map 里，
   后续 /import/*、/profile/import、/event/import 按文件名取出解析。
   同时兼容 node（require vendor/xlsx）用于自测。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');

  var UploadStore = {};   // filename -> data URL(base64)

  function XLSX() {
    return isBrowser ? window.XLSX : require('../../vendor/xlsx.full.min.js');
  }

  // 取上传文件内容（data URL），去掉前缀返回纯 base64
  function _b64Of(filename) {
    var content = UploadStore[filename];
    if (!content) throw new Error('文件未上传或已丢失，请重新上传：' + filename);
    if (typeof content === 'string' && content.indexOf('data:') === 0) {
      return content.slice(content.indexOf(',') + 1);
    }
    return content;
  }

  // 读取工作簿对象（SheetJS workbook）
  function readWorkbook(filename) {
    var b64 = _b64Of(filename);
    var X = XLSX();
    var wb;
    try { wb = X.read(b64, { type: 'base64', cellDates: true }); }
    catch (e) { wb = X.read(b64, { type: 'binary' }); }
    return wb;
  }

  function sheetNames(filename) {
    return readWorkbook(filename).SheetNames;
  }

  // 通用日期转换：Date 对象 / Excel 序列号 / 字符串 → yyyy-mm-dd
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
      return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    }
    if (typeof v === 'number' && isFinite(v)) {
      // Excel 日期序列号（含 1900 闰年 bug，基准 1899-12-30）
      if (v > 20000 && v < 60000) {
        var base = new Date(1899, 11, 30);
        var dt = new Date(base.getTime() + v * 86400000);
        return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
      }
      // 形如 20260801
      if (v >= 19000000 && v <= 29999999) {
        var s = String(v);
        return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
      }
      return null;
    }
    var str = String(v).trim();
    if (!str) return null;
    str = str.replace(/\//g, '-').replace(/\./g, '-')
      .replace('年', '-').replace('月', '-').replace('日', '');
    var parts = str.split('-').filter(function (x) { return x.trim(); });
    try {
      if (parts.length >= 3) {
        var yy = parseInt(parts[0], 10), mm = parseInt(parts[1], 10), dd = parseInt(parts[2].slice(0, 2), 10);
        if (yy < 100) yy += 2000;
        return pad(yy) + '-' + pad(mm) + '-' + pad(dd);
      }
      if (parts.length === 2) {
        var y2 = parseInt(parts[0], 10), m2 = parseInt(parts[1], 10);
        if (y2 < 100) y2 += 2000;
        return pad(y2) + '-' + pad(m2) + '-01';
      }
      if (/^\d{8}$/.test(str)) return str.slice(0, 4) + '-' + str.slice(4, 6) + '-' + str.slice(6, 8);
    } catch (e) { return null; }
    return null;
  }

  function pad(n) { return (n < 10 ? '0' + n : '' + n); }

  // 把单元格转成预览用的字符串
  function cellStr(c) {
    if (c === null || c === undefined) return '';
    if (c instanceof Date) return c.getFullYear() + '-' + pad(c.getMonth() + 1) + '-' + pad(c.getDate());
    if (typeof c === 'object') {
      // SheetJS 富文本/超链接等
      if (c.t !== undefined && c.v !== undefined) return String(c.v);
      try { return JSON.stringify(c); } catch (e) { return String(c); }
    }
    return String(c);
  }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(/,/g, '').replace(/，/g, '');
    ['元', '万元', '%', 'm3', 'm²', 'm2', 't', 'kg', '方'].forEach(function (u) { s = s.split(u).join(''); });
    s = s.trim();
    if (!s || s === '-' || s === '/' || s === '—' || s === 'NA' || s === 'N/A') return null;
    try { return parseFloat(s); } catch (e) { return null; }
  }

  // 在 node 自测里用：直接塞入 base64
  function _setUpload(filename, dataUrl) { UploadStore[filename] = dataUrl; }
  function _getUpload(filename) { return UploadStore[filename]; }

  var routes = {};
  routes['/upload'] = function (p) {
    var fn = p.filename;
    if (!fn) throw new Error('缺少文件名');
    var content = p.content || '';
    UploadStore[fn] = content;
    // 估算大小（去掉 data url 前缀）
    var b64 = (content.indexOf('data:') === 0) ? content.slice(content.indexOf(',') + 1) : content;
    var size = Math.round(b64.length * 3 / 4);
    return { file: fn, size: size };
  };

  var api = {
    routes: routes,
    readWorkbook: readWorkbook,
    sheetNames: sheetNames,
    toDate: toDate,
    toNum: toNum,
    cellStr: cellStr,
    _setUpload: _setUpload,
    _getUpload: _getUpload
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (isBrowser) window.FileUtil = api;
})();
