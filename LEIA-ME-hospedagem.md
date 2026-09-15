# Instalar como app — o que muda quando você hospedar

O arquivo `fundicao7-v7.html` já funciona sozinho: ele gera o manifesto em tempo de
execução e carrega o ícone embutido em base64. No **iPhone** isso basta — o "Adicionar à
Tela de Início" do Safari só precisa das meta tags e do `apple-touch-icon`, e os dois já
estão lá.

No **Android**, o Chrome só oferece a instalação nativa (o `beforeinstallprompt`) quando
encontra um manifesto servido pelo mesmo domínio e um service worker registrado. Por isso
os arquivos abaixo existem — coloque os quatro na mesma pasta ao hospedar:

    fundicao7-v7.html
    manifest.webmanifest
    sw.js
    icon-192.png
    icon-512.png

E acrescente estas duas linhas dentro do `<head>` do HTML hospedado:

    <link rel="manifest" href="./manifest.webmanifest">
    <script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));</script>

Requisitos que não dependem de código:

- **HTTPS obrigatório.** Service worker e instalação não funcionam em http:// (exceto em
  localhost, para teste).
- Se renomear o HTML, ajuste `start_url` no manifesto e a lista `ASSETS` no `sw.js`.
- Ao publicar uma versão nova, troque o nome do cache em `sw.js` (`fundicao7-v1` →
  `v2`), senão os jogadores continuam recebendo a versão antiga do cache.

O service worker também faz o jogo abrir sem internet depois da primeira visita — o que
combina com ele, já que a simulação é toda local e o save fica no próprio navegador.
