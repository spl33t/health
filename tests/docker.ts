import { createDockerContainerCheckers } from '../src/checkers/docker';

async function testDocker() {
    console.log('--- Запуск теста Docker Checker ---');
    console.log('Требуется запущенный Docker (Docker Desktop или демон).\n');

    const checkers = await createDockerContainerCheckers(undefined, ['*'], 1, 0);
    if (checkers.length === 0) {
        console.log('Нет контейнеров для проверки.');
        return;
    }

    console.log(`Создано чекеров: ${checkers.length}. Проверка первого: ${checkers[0].name}\n`);
    const result = await checkers[0].check();

    const icon = result.isUp ? '✅' : '🚨';
    console.log(`${icon} Статус: ${result.isUp ? 'OK' : 'ОШИБКА'}`);
    console.log(`Checker: ${result.checkerName}, Target: ${result.target}`);
    if (result.message) console.log(`Сообщение: ${result.message}`);
    if (result.status) console.log(`Код: ${result.status}`);
}

testDocker().catch(console.error);
