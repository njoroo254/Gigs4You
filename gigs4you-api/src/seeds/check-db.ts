import 'reflect-metadata';
import AppDataSource from '../data-source';
async function run() {
  await AppDataSource.initialize();
  const tasks = await AppDataSource.query('SELECT count(*) as cnt FROM tasks');
  console.log('Tasks count:', tasks[0].cnt);
  const taskSample = await AppDataSource.query('SELECT id, title, status FROM tasks LIMIT 3');
  console.log('Sample tasks:', JSON.stringify(taskSample, null, 2));
  await AppDataSource.destroy();
}
run().catch(e => { console.error(e.message); process.exit(1); });
