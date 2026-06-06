/**
 * LayoutEditor.jsx
 * 드래그 앤 드롭 레이아웃 편집 — SortableCard + 기본 레이아웃 정의
 */
import { useSortable } from '@dnd-kit/sortable'
import { CSS }         from '@dnd-kit/utilities'

/* ── 기본 레이아웃 (widget_config.layout 없을 때 사용) ── */
export const DEFAULT_LAYOUT_ITEMS = [
  { id: 'hero',     span: 12 },   // 100%
  { id: 'schedule', span: 6  },   //  50%
  { id: 'youtube',  span: 6  },   //  50%
  { id: 'stock',    span: 12 },   // 100%
  { id: 'expense',  span: 12 },   // 100%
  { id: 'diet',     span: 6  },   //  50%
  { id: 'memo',     span: 6  },   //  50%
  { id: 'news',     span: 6  },   //  50%
  { id: 'sites',    span: 6  },   //  50%
]

const SIZE_OPTIONS = [
  { label: 'S', value: 3  },   // 25%
  { label: 'M', value: 6  },   // 50%
  { label: 'L', value: 12 },   // 100%
]

/* ── SortableCard ─────────────────────────────────────────────────────────── */
export function SortableCard({ id, span, editMode, onSizeChange, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:   CSS.Transform.toString(transform),
        transition:  transition || undefined,
        gridColumn:  `span ${Math.min(span, 12)}`,
        position:    'relative',
        opacity:     isDragging ? 0.4 : 1,
        zIndex:      isDragging ? 50 : 'auto',
      }}
      className={editMode ? 'layout-editing-card' : ''}
    >
      {/* ─── 편집 오버레이: 드래그 핸들 + 크기 버튼 ─── */}
      {editMode && (
        <div className="layout-edit-overlay">
          <button
            className="layout-drag-handle"
            title="드래그하여 이동"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <div className="layout-size-btns">
            {SIZE_OPTIONS.map(({ label, value }) => (
              <button
                key={label}
                className={`layout-size-btn${span === value ? ' active' : ''}`}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onSizeChange(id, value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── 카드 본문: 편집 모드에서 클릭 방지 ─── */}
      <div style={editMode ? { pointerEvents: 'none', userSelect: 'none' } : {}}>
        {children}
      </div>
    </div>
  )
}
