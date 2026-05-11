const express = require('express');
const path = require('path');
const { BuildynoteClient } = require('../client/buildynote');
const work = require('../tools/work');
const gantt = require('../tools/gantt');
const schedule = require('../tools/schedule');
const master = require('../tools/master');

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

// 認証ミドルウェア（/health と /openapi.yaml は除外）
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

// ヘルスチェック
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'buildynote-mcp' }));

// OpenAPI仕様書
app.get('/openapi.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../openapi.yaml'));
});

// ----- 仕事 -----
app.get('/works', auth, async (req, res) => {
  try { ok(res, await work.listWorks(req.client, req.query)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
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

// ----- 工程 -----
app.get('/works/:work_id/gantt', auth, async (req, res) => {
  try { ok(res, await gantt.listGantts(req.client, { work_id: req.params.work_id, ...req.query })); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
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

// ----- 個人予定 -----
app.get('/schedules', auth, async (req, res) => {
  try { ok(res, await schedule.listSchedules(req.client, req.query)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
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

// ----- マスター -----
app.get('/masters/staff', auth, async (req, res) => {
  try { ok(res, await master.listStaff(req.client)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

app.get('/masters/construction-types', auth, async (req, res) => {
  try { ok(res, await master.listConstructionTypes(req.client)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

app.get('/masters/industry-types', auth, async (req, res) => {
  try { ok(res, await master.listIndustryTypes(req.client)); }
  catch (e) { fail(res, 500, 'API_ERROR', e.message); }
});

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'Endpoint not found'));

app.listen(PORT, () => {
  console.log(`BUILDYNOTE MCP REST server running on http://localhost:${PORT}`);
  console.log(`OpenAPI spec: http://localhost:${PORT}/openapi.yaml`);
});
