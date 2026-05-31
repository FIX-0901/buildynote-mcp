const express = require('express');
const path = require('path');
const { BuildynoteClient } = require('../client/buildynote');
const work = require('../tools/work');
const gantt = require('../tools/gantt');
const schedule = require('../tools/schedule');
const master = require('../tools/master');
const customer = require('../tools/customer');
const office = require('../tools/office');
const department = require('../tools/department');
const position = require('../tools/position');
const propertyType = require('../tools/propertyType');
const company = require('../tools/company');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Token');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

function auth(req, res, next) {
  const token = req.headers['x-api-token'];
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN', message: 'X-Api-Token header is required' } });
  }
  req.client = new BuildynoteClient(token);
  next();
}

function ok(res, data) {
  res.json({ success: true, data, timestamp: new Date().toISOString() });
}

function fail(res, status, code, message) {
  res.status(status).json({ success: false, error: { code, message } });
}

// 単純master用 CRUD ルートを一括で登録するヘルパ
function mountSimpleMaster(basePath, mod, idField, idsField) {
  // list: GET /xxx (?ids= 指定時は複数取得)
  app.get(basePath, auth, async (req, res) => {
    try {
      if (req.query.ids) {
        return ok(res, await mod.multi(req.client, { [idsField]: req.query.ids }));
      }
      ok(res, await mod.list(req.client, req.query));
    } catch (e) { fail(res, 500, 'API_ERROR', e.message); }
  });
  // info: GET /xxx/:id
  app.get(`${basePath}/:id`, auth, async (req, res) => {
    try { ok(res, await mod.info(req.client, { [idField]: req.params.id })); }
    catch (e) { fail(res, 500, 'API_ERROR', e.message); }
  });
  // new: POST /xxx
  if (mod.create) {
    app.post(basePath, auth, async (req, res) => {
      try { ok(res, await mod.create(req.client, req.body)); }
      catch (e) { fail(res, 500, 'API_ERROR', e.message); }
    });
  }
  // edit: PUT /xxx/:id
  if (mod.edit) {
    app.put(`${basePath}/:id`, auth, async (req, res) => {
      try { ok(res, await mod.edit(req.client, { [idField]: req.params.id, ...req.body })); }
      catch (e) { fail(res, 500, 'API_ERROR', e.message); }
    });
  }
  // delete: DELETE /xxx/:id
  if (mod.remove) {
    app.delete(`${basePath}/:id`, auth, async (req, res) => {
      try { ok(res, await mod.remove(req.client, { [idField]: req.params.id })); }
      catch (e) { fail(res, 500, 'API_ERROR', e.message); }
    });
  }
}

// ---- ヘルス / OpenAPI ----
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'buildynote-mcp' }));
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../openapi.yaml'));
});

// ---- 仕事 ----
app.get('/works', auth, async (req, res) => {
  try {
    if (req.query.ids) {
      return ok(res, await work.getWorksMulti(req.client, { work_ids: req.query.ids }));
    }
    ok(res, await work.listWorks(req.client, req.query));
  } catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.get('/works/:id', auth, async (req, res) => {
  try { ok(res, await work.getWork(req.client, { work_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.post('/works', auth, async (req, res) => {
  try { ok(res, await work.createWork(req.client, req.body)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.put('/works/:id', auth, async (req, res) => {
  try { ok(res, await work.editWork(req.client, { work_id: req.params.id, ...req.body })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.delete('/works/:id', auth, async (req, res) => {
  try { ok(res, await work.deleteWork(req.client, { work_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

// ---- 工程 ----
// 横断検索: user_id / company_id / work_id / 期間 で工程を絞り込む (work_id 必須ではない)
app.get('/gantt/search', auth, async (req, res) => {
  try {
    const q = req.query || {};
    const params = {};
    if (q.user_id) params.user_id = q.user_id;
    if (q.work_id) params.work_id = q.work_id;
    if (q.company_id) params.company_id = q.company_id;
    if (q.start_date) params.start_date = q.start_date;
    if (q.end_date) params.end_date = q.end_date;
    if (q.limit) params.limit = q.limit;
    if (q.page) params.page = q.page;
    if (q.fields) params.fields = q.fields;
    ok(res, await gantt.searchGantts(req.client, params));
  } catch (e) { fail(res, 400, 'BAD_REQUEST', e.message); }
});

app.get('/works/:work_id/gantt', auth, async (req, res) => {
  try {
    if (req.query.ids) {
      return ok(res, await gantt.getGanttsMulti(req.client, { schedule_ids: req.query.ids }));
    }
    ok(res, await gantt.listGantts(req.client, { work_id: req.params.work_id, ...req.query }));
  } catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.get('/works/:work_id/gantt/:id', auth, async (req, res) => {
  try { ok(res, await gantt.getGantt(req.client, { gantt_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.post('/works/:work_id/gantt', auth, async (req, res) => {
  try { ok(res, await gantt.createGantt(req.client, { work_id: req.params.work_id, ...req.body })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.put('/works/:work_id/gantt/:id', auth, async (req, res) => {
  try { ok(res, await gantt.editGantt(req.client, { gantt_id: req.params.id, work_id: req.params.work_id, ...req.body })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
// 複数工程の一括編集
app.put('/works/:work_id/gantt', auth, async (req, res) => {
  try { ok(res, await gantt.editGanttsMulti(req.client, { work_id: req.params.work_id, ...req.body })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
// 工程の一括コピー（プレビュー: 実際には作成せず作成予定を返す）
app.post('/works/:source_work_id/gantt/copy/preview', auth, async (req, res) => {
  try { ok(res, await gantt.copyGantts(req.client, { source_work_id: req.params.source_work_id, ...req.body, dry_run: true })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
// 工程の一括コピー（実行）
app.post('/works/:source_work_id/gantt/copy', auth, async (req, res) => {
  try { ok(res, await gantt.copyGantts(req.client, { source_work_id: req.params.source_work_id, ...req.body, dry_run: false })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

// ---- 個人予定 ----
app.get('/schedules', auth, async (req, res) => {
  try {
    if (req.query.ids) {
      return ok(res, await schedule.getSchedulesMulti(req.client, { schedule_ids: req.query.ids }));
    }
    ok(res, await schedule.listSchedules(req.client, req.query));
  } catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.get('/schedules/:id', auth, async (req, res) => {
  try { ok(res, await schedule.getSchedule(req.client, { schedule_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.post('/schedules', auth, async (req, res) => {
  try { ok(res, await schedule.createSchedule(req.client, req.body)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.put('/schedules/:id', auth, async (req, res) => {
  try { ok(res, await schedule.editSchedule(req.client, { schedule_id: req.params.id, ...req.body })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.delete('/schedules/:id', auth, async (req, res) => {
  try { ok(res, await schedule.deleteSchedule(req.client, { schedule_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

// ---- 社員マスタ（社員は読み取り専用、APIに new/edit/delete なし） ----
app.get('/masters/staff', auth, async (req, res) => {
  try {
    if (req.query.ids) {
      return ok(res, await master.getStaffInfoMulti(req.client, { user_ids: req.query.ids }));
    }
    ok(res, await master.listStaff(req.client));
  } catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});
app.get('/masters/staff/:id', auth, async (req, res) => {
  try { ok(res, await master.getStaffInfo(req.client, { user_id: req.params.id })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

// ---- 物件区分マスタ（旧パス: /masters/construction-types を保持しつつ /masters/construction-types/:id 等を提供） ----
const constructionTypeMod = {
  list: master.listConstructionTypes,
  info: master.getConstructionType,
  multi: master.getConstructionTypeMulti,
  create: master.createConstructionType,
  edit: master.editConstructionType,
  remove: master.deleteConstructionType,
};
mountSimpleMaster('/masters/construction-types', constructionTypeMod, 'construction_type_id', 'construction_type_ids');

// ---- 業種区分マスタ ----
const industryTypeMod = {
  list: master.listIndustryTypes,
  info: master.getIndustryType,
  multi: master.getIndustryTypeMulti,
  create: master.createIndustryType,
  edit: master.editIndustryType,
  remove: master.deleteIndustryType,
};
mountSimpleMaster('/masters/industry-types', industryTypeMod, 'industry_type_id', 'industry_type_ids');

// ---- その他 master (単純CRUDヘルパで一括登録) ----
mountSimpleMaster('/masters/customers', customer, 'customer_id', 'customer_ids');
mountSimpleMaster('/masters/offices', office, 'office_id', 'office_ids');
mountSimpleMaster('/masters/departments', department, 'department_id', 'department_ids');
mountSimpleMaster('/masters/positions', position, 'position_id', 'position_ids');
mountSimpleMaster('/masters/property-types', propertyType, 'property_type_id', 'property_type_ids');
mountSimpleMaster('/masters/companies', company, 'company_id', 'company_ids');

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'Endpoint not found'));

app.listen(PORT, () => {
  console.log(`BUILDYNOTE MCP REST server running on http://localhost:${PORT}`);
  console.log(`OpenAPI spec: http://localhost:${PORT}/openapi.yaml`);
});
