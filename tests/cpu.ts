import { CpuChecker } from '../src/checkers/cpu';

async function testCpu() {
    console.log('--- Запуск теста CPU Checker ---');
    console.log('Снимаем первую мерку (нужна пауза для расчета загрузки)...');

    const checker = new CpuChecker(80, 0);

    // Для CPU нужна задержка между измерениями, так как он считает разницу тиков
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Снимаем вторую мерку и считаем загрузку...');
    const result = await checker.check();

    const icon = result.isUp ? '✅' : '🚨';
    console.log(`${icon} Статус: ${result.isUp ? 'OK' : 'ВЫСОКАЯ ЗАГРУЗКА'}`);
    console.log(`Сообщение: ${result.message}`);
}

testCpu().catch(console.error);
