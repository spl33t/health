import { RamChecker } from '../src/checkers/ram';

async function testRam() {
    console.log('--- Запуск теста RAM Checker ---');

    const checker = new RamChecker('Оперативка', 15, 0);
    console.log('Проверка памяти (порог 15%)...');
    const result = await checker.check();

    const icon = result.isUp ? '✅' : '🚨';
    console.log(`${icon} Статус: ${result.isUp ? 'OK' : 'МАЛО ПАМЯТИ'}`);
    console.log(`Сообщение: ${result.message}`);
}

testRam().catch(console.error);
