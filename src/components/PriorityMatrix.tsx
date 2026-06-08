import { useState } from 'react';
import { Card, Typography, Collapse } from 'antd';
import type { Todo } from '../types/todo';
import { getTodosWithPriority } from '../utils/priority';
import { QUADRANT_INFO, type Quadrant } from '../types/todo';

const { Text } = Typography;

interface PriorityMatrixProps {
  todos: Todo[];
}

const PriorityMatrix: React.FC<PriorityMatrixProps> = ({ todos }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const incompleteTodos = todos.filter(t => !t.completed);
  const withPriority = getTodosWithPriority(incompleteTodos);

  const quadrantCounts: Record<Quadrant, number> = {
    'quick-win': 0,
    'obstacle': 0,
    'relaxed': 0,
    'long-term': 0,
  };

  const quadrantTodos: Record<Quadrant, string[]> = {
    'quick-win': [],
    'obstacle': [],
    'relaxed': [],
    'long-term': [],
  };

  withPriority.forEach(todo => {
    quadrantCounts[todo.quadrant]++;
    if (quadrantTodos[todo.quadrant].length < 3) {
      quadrantTodos[todo.quadrant].push(todo.title);
    }
  });

  const collapseItems = [
    {
      key: 'matrix',
      label: (
        <Text strong className="matrix-collapse-title">
          📊 우선순위 매트릭스 — 미완료 {incompleteTodos.length}개
        </Text>
      ),
      children: (
        <div className="priority-matrix-grid">
          {(['quick-win', 'obstacle', 'relaxed', 'long-term'] as Quadrant[]).map(q => {
            const info = QUADRANT_INFO[q];
            return (
              <Card
                key={q}
                className="matrix-cell"
                style={{
                  borderTop: `3px solid ${info.color}`,
                }}
                size="small"
              >
                <div className="matrix-cell-header">
                  <Text strong style={{ color: info.color }}>
                    {info.icon} {info.label}
                  </Text>
                  <Text className="matrix-cell-count" style={{ color: info.color }}>
                    {quadrantCounts[q]}
                  </Text>
                </div>
                <Text type="secondary" className="matrix-cell-desc">
                  {info.description}
                </Text>
                <div className="matrix-cell-items">
                  {quadrantTodos[q].map((title, i) => (
                    <Text key={i} ellipsis className="matrix-item-title">
                      • {title}
                    </Text>
                  ))}
                  {quadrantCounts[q] > 3 && (
                    <Text type="secondary" className="matrix-more">
                      +{quadrantCounts[q] - 3}개 더...
                    </Text>
                  )}
                  {quadrantCounts[q] === 0 && (
                    <Text type="secondary" className="matrix-empty">
                      없음
                    </Text>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <div className="priority-matrix-wrapper">
      <Collapse
        items={collapseItems}
        activeKey={expanded ? ['matrix'] : []}
        onChange={(keys) => setExpanded(keys.length > 0)}
        className="matrix-collapse"
      />
    </div>
  );
};

export default PriorityMatrix;
