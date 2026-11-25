#pragma once

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "esphome/core/hal.h"

// Batches state changes for POST /ingest (device/schema/api.md).
// A batch that got no answer is resent with the same seq, so the server can drop a duplicate.
namespace austral {

struct Entry {
  const char *id;
  uint32_t at;
  std::string value;
};

constexpr size_t kMaxEntries = 512;
constexpr uint32_t kMaxAgeMs = 86400000;

inline std::vector<Entry> queued;
inline std::vector<Entry> in_flight;
inline uint32_t boot = 0;
inline uint32_t seq = 0;
inline bool last_post_ok = false;
// HTTP status of the last answer, 0 before the first one, -1 when the request got no answer.
inline int last_status = 0;

inline void push(const char *id, std::string value) {
  if (queued.size() + in_flight.size() >= kMaxEntries) {
    if (queued.empty()) return;
    queued.erase(queued.begin());
  }
  queued.push_back({id, esphome::millis(), std::move(value)});
}

inline std::string number(float value, int decimals) {
  if (std::isnan(value)) return "nan";
  char text[24];
  snprintf(text, sizeof text, "%.*f", decimals, value);
  return text;
}

inline const char *on_off(bool value) { return value ? "ON" : "OFF"; }

// Moves the queue into a new batch, unless the previous batch still waits for an answer.
inline void take() {
  if (in_flight.empty()) in_flight.swap(queued);
}

inline std::string body(const char *device) {
  uint32_t now = esphome::millis();
  std::string text = std::string("{\"device\":\"") + device + "\",\"boot\":" + std::to_string(boot) +
                     ",\"seq\":" + std::to_string(seq) + ",\"entries\":[";
  bool first = true;
  for (const auto &entry : in_flight) {
    uint32_t age = now - entry.at;
    if (age > kMaxAgeMs) continue;
    if (!first) text += ',';
    first = false;
    text += "{\"id\":\"";
    text += entry.id;
    text += "\",\"age\":";
    text += std::to_string(age);
    text += ",\"value\":\"";
    text += entry.value;
    text += "\"}";
  }
  return text + "]}";
}

// 2xx means stored. 400 and 413 mean the server will never take this batch, so it is dropped too.
inline void answered(int status) {
  last_status = status;
  last_post_ok = status >= 200 && status < 300;
  if (last_post_ok || status == 400 || status == 413) {
    in_flight.clear();
    seq++;
  }
}

}  // namespace austral
