import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const bodySize = new TextEncoder().encode(rawBody).length;

    if (bodySize > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Request too large: ${(bodySize / (1024 * 1024)).toFixed(1)} MB. Max 5 MB.` },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody);
    const { baseUrl, endpointPath, payload, method } = body;

    if (!baseUrl || !endpointPath) {
      return NextResponse.json({ error: 'Missing baseUrl or endpointPath' }, { status: 400 });
    }

    const requestMethod = method || (payload ? 'POST' : 'GET');
    const url = new URL(endpointPath, baseUrl).toString();

    const response = await fetch(url, {
      method: requestMethod,
      headers: { 'Content-Type': 'application/json' },
      body: requestMethod === 'GET' ? undefined : JSON.stringify(payload || {}),
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof data === 'string'
        ? data
        : data?.error?.message || data?.error || `llama.cpp error: ${response.statusText}`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('llama.cpp proxy error:', error);
    const message = error.message === 'fetch failed'
      ? 'Could not reach llama.cpp server. Make sure llama-server.exe is running on the configured base URL, usually http://127.0.0.1:8080.'
      : error.message || 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
