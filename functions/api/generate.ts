export async function onRequestPost(context: { request: Request; env: Record<string, string | undefined> }) {
  const contentType = context.request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await context.request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return Response.json({ error: 'missing-image' }, { status: 400 });
    }

    return new Response(file.stream(), {
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'cache-control': 'no-store',
      },
    });
  }

  if (contentType.includes('application/json')) {
    const body = (await context.request.json().catch(() => null)) as null | { imageUrl?: string };
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : '';
    if (!imageUrl) {
      return Response.json({ error: 'missing-imageUrl' }, { status: 400 });
    }

    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return Response.json({ error: 'fetch-image-failed' }, { status: 400 });
    }

    const contentTypeHeader = upstream.headers.get('content-type') || 'application/octet-stream';
    return new Response(upstream.body, {
      headers: {
        'content-type': contentTypeHeader,
        'cache-control': 'no-store',
      },
    });
  }

  return Response.json({ error: 'unsupported-content-type' }, { status: 415 });
}

