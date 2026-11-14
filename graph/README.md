# Карта кода (graphify) для ревью

Построена 14.11.2026 по этому же обезличенному коду (коммит bf2acc8): 3408 узлов, 9781 связь, 129 сообществ.

```
cd graph && gunzip -k graph.json.gz && mkdir -p graphify-out && mv graph.json graphify-out/ && cp GRAPH_REPORT.md graphify-out/
graphify query "откуда данные пульса Производство"
graphify explain "_key_file()"
graphify path "alert_flush()" "max_send()"
```
