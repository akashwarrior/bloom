import { Streamdown, StreamdownProps } from "streamdown";

export function Markdown(props: StreamdownProps) {
  return (
    <Streamdown
      controls={{
        table: false,
        code: false,
        mermaid: false,
      }}
      {...props}
    />
  )
}
