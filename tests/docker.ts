import { DockerChecker } from '../src/checkers/docker';

async function testDocker() {
    console.log('--- Запуск теста Docker Checker ---');
    console.log('Требуется запущенный Docker (Docker Desktop или демон).\n');

    // Проверка всех контейнеров (*), порог подтверждения 1
    const checker = new DockerChecker('Docker', undefined, ['*'], 1, 0);

    console.log('Проверка контейнеров (unhealthy/restarting/exited)...');
    const result = await checker.check();

    const icon = result.isUp ? '✅' : '🚨';
    console.log(`${icon} Статус: ${result.isUp ? 'OK' : 'ОШИБКА'}`);
    if (result.message) console.log(`Сообщение: ${result.message}`);
    if (result.status) console.log(`Код: ${result.status}`);
}

testDocker().catch(console.error);
