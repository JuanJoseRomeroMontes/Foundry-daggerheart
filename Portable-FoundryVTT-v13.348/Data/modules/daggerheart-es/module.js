Hooks.once('init', () => {
    if (typeof Babele !== 'undefined') {
        const babele = Babele.get();
        babele.register({
            module: 'daggerheart-es',
            lang: 'es',
            dir: 'compendium',
        });
    }
});