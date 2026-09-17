export default function pingWeb(request) {
  return new Response('pong-web-' + process.version, { status: 200 });
}
