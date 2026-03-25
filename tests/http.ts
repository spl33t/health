import { HttpChecker } from '../src/checkers/http';

async function testHttp() {
    console.log('--- Запуск теста HTTP Checker ---');

    const targets = [
        { url: 'https://google.com' },
        { url: 'https://example.com/' },
        { url: 'https://this-site-does-not-exist-123.com' },
    ];

    for (const target of targets) {
        const checker = new HttpChecker(target.url, 0);
        console.log(`Проверка: ${target.url}...`);
        const result = await checker.check();

        const statusIcon = result.isUp ? '✅' : '❌';
        console.log(`${statusIcon} Статус: ${result.isUp ? 'OK' : 'ERROR'}`);
        console.log(`   Checker: ${result.checkerName}, Target: ${result.target}`);
        if (result.status) console.log(`   HTTP Code: ${result.status}`);
        if (result.message) console.log(`   Сообщение: ${result.message}`);
        console.log('---------------------------');
    }
}

testHttp().catch(console.error);
