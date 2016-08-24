package com.classes;

/**
 * Created by Austen on 15/08/2016.
 */
public class ShoppingListItem extends QuantityItem {
    private Long ingredientId;
    private boolean purchased = false;

    public Long getIngredientId(){
        return ingredientId;
    }

    public void setIngredientId(Long ingredientId){
        this.ingredientId = ingredientId;
    }

    public boolean getPurchased(){
        return purchased;
    }

    public void setPurchased(int purchased){
        if (purchased == 0){
            this.purchased = false;
        }
        else{
            this.purchased = true;
        }
    }
}
