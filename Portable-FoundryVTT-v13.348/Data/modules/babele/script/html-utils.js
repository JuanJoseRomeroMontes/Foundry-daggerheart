/**
 * Simple utility class to inject a custom button to the window header.
 */
export class HtmlUtils {

    static appendHeaderButton(html, title, fn) {
        let openBtn = $(`<a class="translate" title="${title}"><i class="fas fa-globe"></i>${title}</a>`);
        openBtn.click(fn);
        html.querySelector('.translate')?.remove();
        let titleElement = html.querySelector('.window-title');
        openBtn.insertAfter(titleElement);
    }
}