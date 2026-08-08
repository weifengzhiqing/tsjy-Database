/* 浏览器端 API 调度器：合并各模块路由，提供 dispatch(path, params)。
   约定：path 形如 /crud/list、/report/stage_summary、/import/run … 与 Python 版 @api 路径一致。
   App.api 改为调用 Backend.dispatch，因此前端无需改动调用方式。 */
(function () {
  'use strict';
  var isBrowser = (typeof window !== 'undefined');
  var DB = isBrowser ? window.DB : require('./db.js');
  var Reports = isBrowser ? window.Reports : require('./reports.js');
  var FU = isBrowser ? window.FileUtil : require('./fileutil.js');
  var Crud = isBrowser ? window.BackendCrud : require('./crud.js');
  var Imp = isBrowser ? window.BackendImport : require('./import.js');
  var Exp = isBrowser ? window.BackendExport : require('./export.js');
  var Extra = isBrowser ? window.BackendExtra : require('./extra.js');
  var Archive = isBrowser ? window.BackendArchive : require('./archive.js');
  var Sum = isBrowser ? window.BackendSummary : require('./summary.js');

  var ROUTES = {};
  [FU, Crud, Imp, Exp, Extra, Archive, Sum].forEach(function (m) {
    if (!m) return;
    var r = m.routes || {};
    Object.keys(r).forEach(function (k) { ROUTES[k] = r[k]; });
  });

  // 报表清单（对齐 Python 的 /report/list）
  ROUTES['/report/list'] = function () { return Reports.list(); };

  var _inited = false;
  async function init() {
    if (_inited) return;
    await DB.init();
    _inited = true;
  }

  async function dispatch(path, p) {
    p = p || {};
    if (!_inited) await init();
    if (path.indexOf('/report/') === 0) {
      var key = path.slice('/report/'.length);
      return Reports.run(key, p);
    }
    var fn = ROUTES[path];
    if (!fn) throw new Error('未知接口: ' + path);
    return await fn(p);
  }

  var Backend = {
    dispatch: dispatch,
    init: init,
    routes: ROUTES,
    Reports: Reports,
    DB: DB
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Backend;
  if (isBrowser) window.Backend = Backend;
})();
