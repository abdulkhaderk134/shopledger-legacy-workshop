'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');

// These objects are fixtures held only in memory. Tests must not use data/db.json.
function riceOrder(overrides = {}) {
  return {
    id: 42,
    date: '22/11/2026',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    items: [{ id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 1000, qty: 1 }],
    coupon: '',
    ...overrides
  };
}

test('invoice GST and total match the amount billed using the item HSN slab', () => {
  const order = riceOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 50);
  assert.equal(billed.total, 1050);
  assert.equal(billed.lines[0].gstPercent, 5);

  assert.equal(invoiceFigures.tax, billed.tax);
  assert.equal(invoiceFigures.cgst, billed.cgst);
  assert.equal(invoiceFigures.sgst, billed.sgst);
  assert.equal(invoiceFigures.total, billed.total);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.rows[0].lineTax, 50);
});

test('invoice discount and tax breakdown match order pricing for a coupon', () => {
  const order = riceOrder({ coupon: 'WELCOME' });
  const billed = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 50, tax: 47.5, total: 997.5 }
  );
  assert.deepEqual(
    { discount: invoiceFigures.discount, tax: invoiceFigures.tax, total: invoiceFigures.total },
    { discount: billed.discount, tax: billed.tax, total: billed.total }
  );
});

test('invoice preserves recorded amounts when current tax or coupon rules differ', () => {
  const order = riceOrder({
    coupon: 'DIWALI20',
    subtotal: 1000,
    discount: 100,
    tax: 45,
    total: 945
  });
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: invoiceFigures.subtotal,
      discount: invoiceFigures.discount,
      tax: invoiceFigures.tax,
      cgst: invoiceFigures.cgst,
      sgst: invoiceFigures.sgst,
      total: invoiceFigures.total
    },
    { subtotal: 1000, discount: 100, tax: 45, cgst: 22.5, sgst: 22.5, total: 945 }
  );
  assert.equal(invoiceFigures.rows[0].lineTax, 45);
});

test('invoice renderer does not warn when recalculated invoice matches stored billed total', () => {
  const billed = pricing.computeTotals(riceOrder().items, '');
  const order = riceOrder({ subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, total: billed.total });
  const html = invoice.render(order);

  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
