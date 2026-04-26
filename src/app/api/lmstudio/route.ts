import { NextRequest, NextResponse } from 'next/server';

// Increase the body size limit for the route handler (images can be large)
export const maxDuration = 120; // 2 min timeout for large generations

export async function POST(req: NextRequest) {
  try {
    // Get raw text first to check size
    const rawBody = await req.text();
    const bodySize = new TextEncoder().encode(rawBody).length;
    
    // 20MB limit
    if (bodySize > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: `Request too large: ${(bodySize / (1024*1024)).toFixed(1)} MB. Max 20 MB. Try reducing image count or quality.` },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody);
    const { baseUrl, endpointPath, payload } = body;

    if (!baseUrl || !endpointPath || !payload) {
      return NextResponse.json({ error: 'Missing baseUrl, endpointPath, or payload' }, { status: 400 });
    }

    const url = new URL(endpointPath, baseUrl).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || `LM Studio error: ${response.statusText}` }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
