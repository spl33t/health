import { DiskChecker } from '../src/checkers/disk';

async function testDisk() {
    console.log('--- Запуск теста Disk Checker ---');

    // Тест всех дисков (без указания конкретного)
    console.log('Тестирование всех дисков (threshold 10%)...');
    const allDisks = new DiskChecker(10, 0);
    const resultAll = await allDisks.check();
    console.log(`Результат: ${resultAll.isUp ? '✅ OK' : '🚨 ОШИБКА'}`);
    console.log(`Сообщение: ${resultAll.message}`);

    console.log('\n---------------------------\n');

    // Тест конкретного существующего диска (пример системного)
    const platform = process.platform;
    const drive = platform === 'win32' ? 'C:' : '/';
    console.log(`Тестирование конкретного диска (${drive})...`);
    const solidDisk = new DiskChecker(10, 0, drive);
    const resultSolid = await solidDisk.check();
    console.log(`Результат: ${resultSolid.isUp ? '✅ OK' : '🚨 ОШИБКА'}`);
    console.log(`Сообщение: ${resultSolid.message}`);
}

testDisk().catch(console.error);
