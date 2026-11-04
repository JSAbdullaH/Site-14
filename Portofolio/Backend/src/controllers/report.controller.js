const reportService = require('../services/report.service');

async function generate(req, res) {
  const { pdf, reference } = await reportService.generate(req.auth, req.validQuery);
  res
    .status(201)
    .type('application/pdf')
    .attachment(`${reference}.pdf`)
    .set('X-Report-Reference', reference)
    .send(pdf);
}

async function verify(req, res) {
  res.json(await reportService.verify(req.params.reference));
}

module.exports = { generate, verify };
