from abc import ABC, abstractmethod
from typing import Literal

from app.core.enums import StorageType
from app.db.models import Ingredient, IngredientCategory, Supplier

Resource = Literal["ingredient-categories", "ingredients", "suppliers"]
Master = IngredientCategory | Ingredient | Supplier


class MasterDataRepository(ABC):
    @abstractmethod
    def list(
        self,
        resource: Resource,
        search: str,
        is_active: bool | None,
        category_id: int | None,
        storage_method: StorageType | None,
        page: int,
        page_size: int,
    ) -> tuple[list[Master], int]: ...

    @abstractmethod
    def get(self, resource: Resource, record_id: int, *, lock: bool = False) -> Master | None: ...

    @abstractmethod
    def duplicate(self, resource: Resource, value: str, own_id: int | None) -> bool: ...

    @abstractmethod
    def referenced(
        self, resource: Resource, record_id: int, *, active_only: bool = False
    ) -> bool: ...

    @abstractmethod
    def add(self, record: Master) -> None: ...

    @abstractmethod
    def delete(self, record: Master) -> None: ...

    @abstractmethod
    def flush(self) -> None: ...
