// Firebase 데이터 마이그레이션 스크립트 (Node.js에서 직접 실행)
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, writeBatch } = require('firebase/firestore');
const fs = require('fs');

const firebaseConfig = {
  apiKey: "AIzaSyDxqP4iJZlSZjCTg6vysyBvzM_fZkoZZD8",
  authDomain: "dongjae-todo.firebaseapp.com",
  projectId: "dongjae-todo",
  storageBucket: "dongjae-todo.firebasestorage.app",
  messagingSenderId: "232110760055",
  appId: "1:232110760055:web:f8ee1422c3e33d93d36672"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  const data = JSON.parse(fs.readFileSync('./extracted_todos.json', 'utf-8'));
  
  const todos = data.todos || [];
  const holidays = data.holidays || [];
  const courseTasks = data.courseTasks || [];
  const completedCourseTasks = data.completedCourseTasks || {};
  const excludedCourseTasks = data.excludedCourseTasks || {};

  console.log(`=== Firebase 데이터 마이그레이션 시작 ===`);
  console.log(`Todos: ${todos.length}개, Holidays: ${holidays.length}개`);

  // Batch upload (max 500 per batch)
  const batchSize = 500;

  // 1. Upload Todos
  console.log(`\n[1/4] Todos 업로드 중...`);
  for (let i = 0; i < todos.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = todos.slice(i, i + batchSize);
    chunk.forEach(todo => {
      if (todo.id) {
        batch.set(doc(db, 'todos', todo.id), todo);
      }
    });
    await batch.commit();
    console.log(`  ${Math.min(i + batchSize, todos.length)} / ${todos.length} 완료`);
  }

  // 2. Upload Holidays
  console.log(`\n[2/4] Holidays 업로드 중...`);
  if (holidays.length > 0) {
    const batch = writeBatch(db);
    holidays.forEach(h => {
      if (h.date) {
        batch.set(doc(db, 'holidays', h.date), h);
      }
    });
    await batch.commit();
    console.log(`  ${holidays.length}개 완료`);
  } else {
    console.log(`  없음 (스킵)`);
  }

  // 3. Upload Course Tasks
  console.log(`\n[3/4] Course Tasks 업로드 중...`);
  if (courseTasks.length > 0) {
    const batch = writeBatch(db);
    courseTasks.forEach(t => {
      if (t.id) {
        batch.set(doc(db, 'courseTasks', t.id), t);
      }
    });
    await batch.commit();
    console.log(`  ${courseTasks.length}개 완료`);
  } else {
    console.log(`  없음 (스킵)`);
  }

  // 4. Upload Metadata
  console.log(`\n[4/4] 메타데이터 업로드 중...`);
  await setDoc(doc(db, 'appState', 'metadata'), {
    completedCourseTasks,
    excludedCourseTasks
  });
  console.log(`  완료`);

  console.log(`\n=== 마이그레이션 완료! ===`);
  console.log(`Firebase Firestore에 총 ${todos.length + holidays.length}개 문서 업로드 성공.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
