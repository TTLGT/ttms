import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminAuthError } from '@/lib/firebase-admin';
import { importCarriersCSV, importCustomersCSV, importOrdersCSVs, type ImportResult } from '@/lib/batsImport';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const form = await req.formData();
  const results: ImportResult[] = [];

  const carriersFile = form.get('carriers');
  if (carriersFile instanceof File) {
    results.push(await importCarriersCSV(await carriersFile.text()));
  }

  const customersFile = form.get('customers');
  if (customersFile instanceof File) {
    results.push(await importCustomersCSV(await customersFile.text()));
  }

  const orderFiles = form.getAll('orders').filter((f): f is File => f instanceof File);
  if (orderFiles.length) {
    results.push(await importOrdersCSVs(await Promise.all(orderFiles.map((f) => f.text()))));
  }

  if (!results.length) {
    return NextResponse.json({ error: 'No CSV files were provided' }, { status: 400 });
  }

  return NextResponse.json({ results });
}
