#ifndef I18N_H
#define I18N_H

#include <string>

namespace I18n {

bool Init();

std::string GetLanguage();
bool SetLanguage(const std::string& language);

const char* Tr(const char* key);

}

#endif
