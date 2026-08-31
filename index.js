// worker.js
// Backend do Encurtador de Links.
// Peça da nuvem: KV, o armazenamento de chave e valor da Cloudflare.
// Este arquivo inteiro vai colado no editor do Worker, no painel da Cloudflare.
//
// IMPORTANTE: o Worker precisa ter um binding de KV chamado LINKS.
// O passo a passo está no README.md.

// Cabeçalhos que autorizam a página publicada no Pages a chamar este Worker.
// Sem isso, o navegador bloqueia a chamada por CORS.
const CABECALHOS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Atalho para responder em JSON sempre com os cabeçalhos de CORS.
function responderJson(dados, status) {
  return new Response(JSON.stringify(dados), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Sorteia o código curto que vai virar a chave no KV.
// As letras confusas (l, o, 0, 1) ficaram de fora de propósito, porque esse
// código às vezes é lido em voz alta ou digitado à mão.
function gerarCodigo() {
  const caracteres = "abcdefghijkmnpqrstuvwxyz23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    const sorteio = Math.floor(Math.random() * caracteres.length);
    codigo = codigo + caracteres[sorteio];
  }
  return codigo;
}

// Página simples mostrada quando o código curto não existe.
function paginaCodigoNaoEncontrado(codigo) {
  return "<!DOCTYPE html>" +
    "<html lang=\"pt-BR\"><head><meta charset=\"UTF-8\">" +
    "<title>Link não encontrado</title></head>" +
    "<body style=\"font-family: system-ui, sans-serif; background:#0f172a; color:#f8fafc; " +
    "display:grid; place-items:center; min-height:100vh; margin:0; text-align:center\">" +
    "<div><h1>Link não encontrado</h1>" +
    "<p>Não existe nenhum link guardado com o código <strong>" + codigo + "</strong>.</p>" +
    "<p>Confira se você copiou o endereço inteiro.</p></div></body></html>";
}

export default {
  // env é o segundo parâmetro do fetch. É por ele que o Worker enxerga o KV.
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname;

    // Antes de um POST com JSON, o navegador manda um OPTIONS perguntando se pode.
    // Se ninguém responder esse OPTIONS, o POST nem chega a sair.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CABECALHOS_CORS });
    }

    // ROTA 1: POST /encurtar
    // Recebe a URL longa, guarda no KV e devolve o link curto pronto.
    if (request.method === "POST" && caminho === "/encurtar") {
      let corpo;
      try {
        corpo = await request.json();
      } catch (erro) {
        return responderJson({ erro: "Envie um JSON com o campo urlLonga." }, 400);
      }

      const urlLonga = (corpo.urlLonga || "").trim();

      // Validação mínima. Sem ela dá para guardar qualquer texto, e o
      // redirecionamento quebra depois, longe daqui.
      if (!urlLonga.startsWith("http://") && !urlLonga.startsWith("https://")) {
        return responderJson(
          { erro: "A URL precisa começar com http:// ou https://" },
          400
        );
      }

      const codigo = gerarCodigo();

      // Aqui a peça KV entra em cena.
      // put guarda o valor (a URL longa) debaixo da chave (o código curto).
      await env.LINKS.put(codigo, urlLonga);

      return responderJson({
        codigo: codigo,
        linkCurto: url.origin + "/r/" + codigo,
        urlLonga: urlLonga,
      });
    }

    // ROTA 2: GET /r/codigo
    // Procura o código no KV e manda o navegador para a URL original.
    if (request.method === "GET" && caminho.startsWith("/r/")) {
      const codigo = caminho.substring(3);

      // get devolve o valor guardado, ou null quando a chave não existe.
      const urlLonga = await env.LINKS.get(codigo);

      if (urlLonga === null) {
        return new Response(paginaCodigoNaoEncontrado(codigo), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // 302 é o código de redirecionamento temporário.
      // O navegador recebe e vai sozinho para o endereço original.
      return Response.redirect(urlLonga, 302);
    }

    // ROTA 3: GET /
    // Serve só para conferir, no navegador, que o Worker está no ar.
    if (request.method === "GET" && caminho === "/") {
      return responderJson({ servico: "encurtador de links", status: "no ar" });
    }

    return responderJson({ erro: "Rota não encontrada." }, 404);
  },
};
