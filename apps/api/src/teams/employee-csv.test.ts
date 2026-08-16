import { describe, expect, it } from 'vitest';
import { ImportFormatError, MAX_IMPORT_ROWS, parseCsv, parseEmployeeCsv } from './employee-csv.js';

describe('parseCsv', () => {
  it('يفكّ الاقتباس المضاعف والفواصل داخل القيمة', () => {
    const rows = parseCsv('a,"b,c","d""e"\n1,2,3');
    expect(rows).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });

  it('يقبل أسطر ويندوز وعلامة ترتيب البايتات', () => {
    const rows = parseCsv('﻿email\r\nsalim@example.com\r\n');
    expect(rows).toEqual([['email'], ['salim@example.com']]);
  });

  it('يحتفظ بسطر جديد داخل قيمة مقتبسة', () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });

  it('يتخطى الأسطر الفارغة', () => {
    expect(parseCsv('a\n\n\nb')).toEqual([['a'], ['b']]);
  });
});

describe('parseEmployeeCsv', () => {
  it('يقرأ الترويسة العربية والإنجليزية', () => {
    const { rows } = parseEmployeeCsv(
      'الاسم,البريد الإلكتروني,الإدارة\nسالم,salim@example.com,SALES',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'salim@example.com',
      fullName: 'سالم',
      departmentCode: 'SALES',
      rowNumber: 2,
    });
  });

  it('يرفض ملفاً بلا عمود بريد', () => {
    expect(() => parseEmployeeCsv('name,department\nسالم,SALES')).toThrow(ImportFormatError);
  });

  it('يسجّل الصف الخاطئ ويكمل البقية بدل إسقاط الدفعة', () => {
    const { rows, errors, totalRows } = parseEmployeeCsv(
      'email\nvalid@example.com\nليس بريداً\nsecond@example.com',
    );

    expect(rows.map((row) => row.email)).toEqual(['valid@example.com', 'second@example.com']);
    expect(errors).toEqual([{ row: 3, reason: 'invalid_value', field: 'email' }]);
    expect(totalRows).toBe(3);
  });

  it('يبقي أول ظهور للبريد المكرر ويسجّل ما بعده', () => {
    const { rows, errors } = parseEmployeeCsv(
      'email,department\nsalim@example.com,SALES\nSALIM@example.com,HR',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.departmentCode).toBe('SALES');
    expect(errors).toEqual([{ row: 3, reason: 'duplicate_in_file', field: 'email' }]);
  });

  it('يرفض ملفاً يتجاوز الحد الأقصى للصفوف', () => {
    const body = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_unused, index) => `user${index}@example.com`,
    ).join('\n');

    expect(() => parseEmployeeCsv(`email\n${body}`)).toThrow(ImportFormatError);
  });
});
